// ============================================================================
// FILE: apps/api/src/routes/clients.ts
// GET    /api/clients              — list clients (tenant-filtered)
// POST   /api/clients              — create client + trigger onboarding
// GET    /api/clients/:id/dashboard — compliance dashboard
// GET    /api/clients/:id/graph     — obligation graph for visualization
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  CreateClientSchema,
  PaginationSchema,
  Errors,
} from '@regwatch/shared';
import type { Client } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import type { ComplianceGraphService } from '../graph/complianceGraph.js';
import type { OnboardingEngine } from '../services/onboarding.js';

const logger = createServiceLogger('route:clients');

export interface ClientRouteDeps {
  readonly prisma: PrismaClient;
  readonly graphService: ComplianceGraphService;
  readonly onboardingEngine: OnboardingEngine;
}

export function createClientsRouter(deps: ClientRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /api/clients
  // -----------------------------------------------------------------------
  router.get('/clients', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;

    const parsed = PaginationSchema.safeParse(req.query);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const { page, pageSize } = parsed.data;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      deps.prisma.client.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      deps.prisma.client.count({ where: { tenantId } }),
    ]);

    logger.info({
      operation: 'clients:list',
      requestId,
      tenantId,
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
  // POST /api/clients
  // -----------------------------------------------------------------------
  router.post('/clients', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;

    const parsed = CreateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const input = parsed.data;

    // Check for duplicate name within tenant
    const existing = await deps.prisma.client.findFirst({
      where: { tenantId, name: input.name },
      select: { id: true },
    });

    if (existing) {
      throw Errors.conflict(requestId, `Client '${input.name}' already exists`);
    }

    // Create client in PostgreSQL
    const clientId = randomUUID();
    const now = new Date();

    const client = await deps.prisma.client.create({
      data: {
        id: clientId,
        tenantId,
        name: input.name,
        countries: input.countries,
        companyType: input.companyType,
        industries: input.industries,
        contactEmail: input.contactEmail,
        isActive: true,
        onboardedAt: now,
      },
    });

    // Trigger onboarding asynchronously if engine is available
    if (deps.onboardingEngine) {
      const clientData: Client = {
        id: client.id,
        tenantId: client.tenantId,
        name: client.name,
        countries: client.countries,
        companyType: client.companyType,
        industries: client.industries,
        contactEmail: client.contactEmail,
        isActive: client.isActive,
        onboardedAt: client.onboardedAt,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      };

      void deps.onboardingEngine.generateComplianceMap(clientData).catch((err) => {
        logger.error({
          operation: 'clients:onboarding_failed',
          requestId,
          clientId,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    logger.info({
      operation: 'clients:create',
      requestId,
      clientId,
      tenantId,
      name: input.name,
      countries: input.countries,
      result: 'success',
    });

    res.status(201).json(client);
  });

  // -----------------------------------------------------------------------
  // GET /api/clients/:id/dashboard
  // -----------------------------------------------------------------------
  router.get('/clients/:id/dashboard', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;
    const { id } = req.params;

    const client = await deps.prisma.client.findFirst({
      where: { id, tenantId },
    });

    if (!client) {
      throw Errors.notFound(requestId, 'Client', id!);
    }

    // Parallel data fetch from Prisma (no graph service dependency)
    const [obligations, recentAlerts, recentChanges] = await Promise.all([
      deps.prisma.obligation.findMany({
        where: { clientId: id, tenantId },
        orderBy: { deadline: 'asc' },
      }),
      deps.prisma.alert.findMany({
        where: { clientId: id, tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      deps.prisma.regulatoryChange.findMany({
        where: { country: { in: client.countries } },
        orderBy: { publishedDate: 'desc' },
        take: 10,
      }),
    ]);

    const totalObligations = obligations.length;
    const completedCount = obligations.filter((o) => o.status === 'COMPLETED').length;
    const complianceScore = totalObligations > 0
      ? Math.round((completedCount / totalObligations) * 100)
      : 100;

    const obligationsByStatus: Record<string, number> = {};
    for (const obl of obligations) {
      obligationsByStatus[obl.status] = (obligationsByStatus[obl.status] ?? 0) + 1;
    }

    const upcomingDeadlines = obligations
      .filter((o) => o.status !== 'COMPLETED')
      .slice(0, 10);

    logger.info({
      operation: 'clients:dashboard',
      requestId,
      clientId: id,
      totalObligations,
      complianceScore,
      result: 'success',
    });

    res.json({
      clientId: id,
      clientName: client.name,
      companyType: client.companyType,
      countries: client.countries,
      tenantId,
      complianceScore,
      totalObligations,
      obligationsByStatus,
      recentChanges,
      pendingAlerts: recentAlerts,
      upcomingDeadlines,
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/clients/:id/graph
  // -----------------------------------------------------------------------
  router.get('/clients/:id/graph', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;
    const { id } = req.params;

    const depth = Math.min(parseInt(req.query['depth'] as string ?? '3', 10), 5);

    // Verify client belongs to tenant
    const clientExists = await deps.prisma.client.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!clientExists) {
      throw Errors.notFound(requestId, 'Client', id!);
    }

    // Build graph from Prisma data (no Neo4j dependency)
    const client = await deps.prisma.client.findFirst({
      where: { id, tenantId },
      include: {
        obligations: {
          include: { change: { select: { id: true, title: true, country: true } } },
        },
      },
    });

    if (!client) {
      throw Errors.notFound(requestId, 'Client', id!);
    }

    const nodes: { id: string; label: string; type: string; properties: Record<string, unknown> }[] = [];
    const edges: { id: string; sourceNodeId: string; targetNodeId: string; relationship: string }[] = [];

    // Client node
    nodes.push({ id: client.id, label: client.name, type: 'CLIENT', properties: { companyType: client.companyType } });

    // Country nodes
    for (const country of client.countries) {
      const nodeId = `country-${country}`;
      if (!nodes.find((n) => n.id === nodeId)) {
        nodes.push({ id: nodeId, label: country, type: 'JURISDICTION', properties: {} });
        edges.push({ id: `${client.id}-${nodeId}`, sourceNodeId: client.id, targetNodeId: nodeId, relationship: 'OPERATES_IN' });
      }
    }

    // Obligation + Regulation nodes
    for (const obl of client.obligations) {
      nodes.push({ id: obl.id, label: obl.title, type: 'OBLIGATION', properties: { status: obl.status, deadline: obl.deadline.toISOString().split('T')[0], priority: obl.priority } });
      const countryNodeId = `country-${obl.change.country}`;
      edges.push({ id: `${countryNodeId}-${obl.id}`, sourceNodeId: countryNodeId, targetNodeId: obl.id, relationship: 'HAS_OBLIGATION' });

      // Regulation node
      const regNodeId = `reg-${obl.change.id}`;
      if (!nodes.find((n) => n.id === regNodeId)) {
        nodes.push({ id: regNodeId, label: obl.change.title, type: 'REGULATION', properties: {} });
      }
      edges.push({ id: `${obl.id}-${regNodeId}`, sourceNodeId: obl.id, targetNodeId: regNodeId, relationship: 'REQUIRED_BY' });
    }

    logger.info({
      operation: 'clients:graph',
      requestId,
      clientId: id,
      nodes: nodes.length,
      edges: edges.length,
      result: 'success',
    });

    res.json({ nodes, edges });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/clients/:id — soft delete (set isActive = false)
  // -----------------------------------------------------------------------
  router.delete('/clients/:id', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const tenantId = (req as AuthenticatedRequest).tenantId!;
    const { id } = req.params;

    const client = await deps.prisma.client.findFirst({
      where: { id, tenantId },
    });

    if (!client) {
      throw Errors.notFound(requestId, 'Client', id!);
    }

    const updated = await deps.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });

    logger.info({
      operation: 'clients:soft_delete',
      requestId,
      clientId: id,
      clientName: client.name,
      result: 'success',
    });

    res.json(updated);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}
