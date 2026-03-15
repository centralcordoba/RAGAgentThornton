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

    // Audit
    await deps.prisma.auditEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        action: 'CLIENT_ONBOARDED',
        entityType: 'Client',
        entityId: clientId,
        performedBy: (req as AuthenticatedRequest).userId ?? 'unknown',
        details: {
          name: input.name,
          countries: input.countries,
          companyType: input.companyType,
          industries: input.industries,
        },
      },
    });

    // Trigger onboarding asynchronously (graph registration + compliance map)
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

    // Parallel data fetch
    const [obligationMap, upcomingDeadlines, recentAlerts, recentChanges] = await Promise.all([
      deps.graphService.getClientObligations(clientData),
      deps.graphService.getUpcomingDeadlines(tenantId, 90),
      deps.prisma.alert.findMany({
        where: { clientId: id, tenantId, createdAt: { gte: thirtyDaysAgo() } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      deps.prisma.regulatoryChange.findMany({
        where: {
          country: { in: client.countries },
          publishedDate: { gte: thirtyDaysAgo() },
        },
        orderBy: { publishedDate: 'desc' },
        take: 10,
      }),
    ]);

    // Filter deadlines for this specific client
    const clientDeadlines = upcomingDeadlines.filter((d) => d.clientId === id);

    // Calculate compliance score
    const totalObligations = obligationMap.totalObligations;
    const completedCount = Object.values(obligationMap.byCountry)
      .flat()
      .filter((o) => o.status === 'COMPLETED').length;
    const complianceScore = totalObligations > 0
      ? Math.round((completedCount / totalObligations) * 100)
      : 100;

    // Build country status
    const countriesStatus = client.countries.map((country) => {
      const countryObligations = obligationMap.byCountry[country] ?? [];
      const completed = countryObligations.filter((o) => o.status === 'COMPLETED').length;
      return {
        country,
        status: completed === countryObligations.length ? 'compliant' : 'pending',
        obligationsTotal: countryObligations.length,
        obligationsCompleted: completed,
        lastUpdated: new Date(),
      };
    });

    // Obligations by status
    const allObligations = Object.values(obligationMap.byCountry).flat();
    const obligationsByStatus: Record<string, number> = {};
    for (const obl of allObligations) {
      obligationsByStatus[obl.status] = (obligationsByStatus[obl.status] ?? 0) + 1;
    }

    logger.info({
      operation: 'clients:dashboard',
      requestId,
      clientId: id,
      totalObligations,
      complianceScore,
      upcomingDeadlines: clientDeadlines.length,
      recentAlerts: recentAlerts.length,
      result: 'success',
    });

    res.json({
      clientId: id,
      tenantId,
      complianceScore,
      totalObligations,
      obligationsByStatus,
      recentChanges,
      pendingAlerts: recentAlerts,
      upcomingDeadlines: clientDeadlines,
      countries: countriesStatus,
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

    const graph = await deps.graphService.getClientGraph(id!, tenantId, depth);

    logger.info({
      operation: 'clients:graph',
      requestId,
      clientId: id,
      depth,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      result: 'success',
    });

    res.json(graph);
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
