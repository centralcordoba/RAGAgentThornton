// ============================================================================
// FILE: apps/api/src/routes/alerts.ts
// GET  /api/alerts          — list alerts with filters + pagination
// POST /api/alerts/:id/ack  — acknowledge alert (HITL for HIGH)
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  ListAlertsSchema,
  AcknowledgeAlertSchema,
  Errors,
} from '@regwatch/shared';
import type { AlertStatus } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:alerts');

export interface AlertRouteDeps {
  readonly prisma: PrismaClient;
}

export function createAlertsRouter(deps: AlertRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /api/alerts
  // -----------------------------------------------------------------------
  router.get('/alerts', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;
    const userRole = (req as AuthenticatedRequest).userRole!;

    const parsed = ListAlertsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const { page, pageSize, clientId, status, impactLevel, channel } = parsed.data;
    const skip = (page - 1) * pageSize;

    // Build where clause with mandatory tenant filter
    const where: Record<string, unknown> = { tenantId };

    if (clientId) where['clientId'] = clientId;
    if (status) where['status'] = status;
    if (impactLevel) where['impactLevel'] = impactLevel;
    if (channel) where['channel'] = channel;

    // CLIENT_VIEWER can only see SENT and ACKNOWLEDGED alerts
    if (userRole === 'CLIENT_VIEWER') {
      where['status'] = { in: ['SENT', 'ACKNOWLEDGED'] };
    }

    const [data, total] = await Promise.all([
      deps.prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      deps.prisma.alert.count({ where }),
    ]);

    logger.info({
      operation: 'alerts:list',
      requestId,
      tenantId,
      userRole,
      filters: { clientId, status, impactLevel, channel },
      page,
      total,
      result: 'success',
    });

    res.json({
      data,
      total,
      page,
      pageSize,
      hasMore: skip + data.length < total,
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/alerts/:id/ack
  // -----------------------------------------------------------------------
  router.post('/alerts/:id/ack', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;
    const userId = (req as AuthenticatedRequest).userId!;
    const userRole = (req as AuthenticatedRequest).userRole!;
    const { id } = req.params;

    const parsed = AcknowledgeAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    // Fetch alert with tenant filter
    const alert = await deps.prisma.alert.findFirst({
      where: { id, tenantId },
    });

    if (!alert) {
      throw Errors.notFound(requestId, 'Alert', id!);
    }

    // Determine action based on current status
    const now = new Date();
    let newStatus: AlertStatus;
    let auditAction: string;

    if (alert.status === 'PENDING_REVIEW') {
      // HITL approval — requires PROFESSIONAL or ADMIN role
      if (userRole !== 'PROFESSIONAL' && userRole !== 'ADMIN') {
        throw Errors.forbidden(
          requestId,
          'Only PROFESSIONAL or ADMIN roles can approve HIGH impact alerts',
        );
      }

      newStatus = 'APPROVED';
      auditAction = 'ALERT_APPROVED';

      logger.info({
        operation: 'alerts:hitl_approve',
        requestId,
        alertId: id,
        approvedBy: userId,
        impactLevel: alert.impactLevel,
        result: 'approved',
      });
    } else if (alert.status === 'SENT' || alert.status === 'APPROVED') {
      // Client acknowledgment
      newStatus = 'ACKNOWLEDGED';
      auditAction = 'ALERT_ACKNOWLEDGED';
    } else if (alert.status === 'ACKNOWLEDGED') {
      throw Errors.conflict(requestId, 'Alert is already acknowledged');
    } else if (alert.status === 'DISMISSED') {
      throw Errors.conflict(requestId, 'Alert has been dismissed');
    } else {
      throw Errors.conflict(requestId, `Cannot acknowledge alert in status '${alert.status}'`);
    }

    // Update alert
    const updated = await deps.prisma.alert.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === 'APPROVED' ? { reviewedBy: userId, reviewedAt: now } : {}),
        ...(newStatus === 'ACKNOWLEDGED' ? { acknowledgedAt: now } : {}),
      },
    });

    // Audit entry
    await deps.prisma.auditEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        action: auditAction,
        entityType: 'Alert',
        entityId: id!,
        performedBy: userId,
        details: {
          previousStatus: alert.status,
          newStatus,
          notes: parsed.data.notes ?? null,
        },
      },
    });

    logger.info({
      operation: 'alerts:ack',
      requestId,
      alertId: id,
      previousStatus: alert.status,
      newStatus,
      acknowledgedBy: userId,
      result: 'success',
    });

    res.json(updated);
  });

  return router;
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}
