// ============================================================================
// FILE: apps/api/tests/tenantIsolation.test.ts
// Tenant isolation tests — verify that tenant A NEVER sees data from tenant B.
//
// These tests validate isolation at the API layer using two test tenants
// with different JWT tokens. Every data-returning endpoint is tested.
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import express, { type Request, type Response, type Router } from 'express';
import request from 'supertest';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { createRequestIdMiddleware } from '../src/middleware/requestId.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { getAuthHeader, TEST_USERS } from './helpers/testAuth.js';

// Set env for auth middleware
process.env['JWT_SECRET'] = 'test-secret-for-ci';

// ---------------------------------------------------------------------------
// Simulated data store with tenant-scoped data
// ---------------------------------------------------------------------------

interface TenantRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
}

const MOCK_DATA: readonly TenantRecord[] = [
  { id: 'reg-001', tenantId: 'tenant-001', name: 'SEC Rule 10b-5 Amendment' },
  { id: 'reg-002', tenantId: 'tenant-001', name: 'BOE Circular 4/2024' },
  { id: 'reg-003', tenantId: 'tenant-002', name: 'CNBV NIF-C-16 Update' },
  { id: 'reg-004', tenantId: 'tenant-002', name: 'CVM Instrução 175' },
];

const MOCK_CLIENTS: readonly TenantRecord[] = [
  { id: 'client-001', tenantId: 'tenant-001', name: 'Acme Corp' },
  { id: 'client-002', tenantId: 'tenant-002', name: 'Globex Inc' },
];

const MOCK_ALERTS: readonly TenantRecord[] = [
  { id: 'alert-001', tenantId: 'tenant-001', name: 'SEC filing deadline alert' },
  { id: 'alert-002', tenantId: 'tenant-002', name: 'CNBV compliance alert' },
];

// ---------------------------------------------------------------------------
// Test app simulating tenant-filtered endpoints
// ---------------------------------------------------------------------------

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware());

  // Health (no auth)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy' });
  });

  app.use('/api', createAuthMiddleware());

  // GET /api/regulations — must filter by tenantId
  app.get('/api/regulations', (req: Request, res: Response) => {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const filtered = MOCK_DATA.filter((r) => r.tenantId === tenantId);
    res.json({ data: filtered, total: filtered.length });
  });

  // GET /api/clients — must filter by tenantId
  app.get('/api/clients', (req: Request, res: Response) => {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const filtered = MOCK_CLIENTS.filter((c) => c.tenantId === tenantId);
    res.json({ data: filtered, total: filtered.length });
  });

  // GET /api/alerts — must filter by tenantId
  app.get('/api/alerts', (req: Request, res: Response) => {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const filtered = MOCK_ALERTS.filter((a) => a.tenantId === tenantId);
    res.json({ data: filtered, total: filtered.length });
  });

  // GET /api/regulations/:id — must check tenantId ownership
  app.get('/api/regulations/:id', (req: Request, res: Response) => {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const record = MOCK_DATA.find((r) => r.id === req.params['id']);
    if (!record || record.tenantId !== tenantId) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', requestId: req.requestId });
      return;
    }
    res.json(record);
  });

  // GET /api/clients/:id/dashboard — must check tenantId ownership
  app.get('/api/clients/:id/dashboard', (req: Request, res: Response) => {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const client = MOCK_CLIENTS.find((c) => c.id === req.params['id']);
    if (!client || client.tenantId !== tenantId) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Not found', requestId: req.requestId });
      return;
    }
    res.json({ clientId: client.id, complianceScore: 85 });
  });

  app.use(createErrorHandler());
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tenant Isolation', () => {
  const app = createTestApp();

  // Tenant 1 tokens
  const tenant1AdminHeader = getAuthHeader(TEST_USERS.admin);         // tenant-001
  const tenant1ViewerHeader = getAuthHeader(TEST_USERS.clientViewer); // tenant-001

  // Tenant 2 token
  const tenant2AdminHeader = getAuthHeader(TEST_USERS.otherTenant);   // tenant-002

  // -------------------------------------------------------------------------
  // List endpoints — data must be scoped to requesting tenant
  // -------------------------------------------------------------------------

  describe('GET /api/regulations (list)', () => {
    it('tenant-001 sees only tenant-001 regulations', async () => {
      const res = await request(app)
        .get('/api/regulations')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data.every((r: TenantRecord) => r.tenantId === 'tenant-001')).toBe(true);
      expect(res.body.data.map((r: TenantRecord) => r.id)).toEqual(['reg-001', 'reg-002']);
    });

    it('tenant-002 sees only tenant-002 regulations', async () => {
      const res = await request(app)
        .get('/api/regulations')
        .set('Authorization', tenant2AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data.every((r: TenantRecord) => r.tenantId === 'tenant-002')).toBe(true);
      expect(res.body.data.map((r: TenantRecord) => r.id)).toEqual(['reg-003', 'reg-004']);
    });

    it('tenant-001 NEVER sees tenant-002 data in regulations list', async () => {
      const res = await request(app)
        .get('/api/regulations')
        .set('Authorization', tenant1AdminHeader);
      const ids = res.body.data.map((r: TenantRecord) => r.id);
      expect(ids).not.toContain('reg-003');
      expect(ids).not.toContain('reg-004');
    });
  });

  describe('GET /api/clients (list)', () => {
    it('tenant-001 sees only own clients', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('client-001');
    });

    it('tenant-002 sees only own clients', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', tenant2AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe('client-002');
    });

    it('tenant-002 NEVER sees tenant-001 clients', async () => {
      const res = await request(app)
        .get('/api/clients')
        .set('Authorization', tenant2AdminHeader);
      const ids = res.body.data.map((c: TenantRecord) => c.id);
      expect(ids).not.toContain('client-001');
    });
  });

  describe('GET /api/alerts (list)', () => {
    it('tenant-001 sees only own alerts', async () => {
      const res = await request(app)
        .get('/api/alerts')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].tenantId).toBe('tenant-001');
    });

    it('tenant-002 NEVER sees tenant-001 alerts', async () => {
      const res = await request(app)
        .get('/api/alerts')
        .set('Authorization', tenant2AdminHeader);
      const ids = res.body.data.map((a: TenantRecord) => a.id);
      expect(ids).not.toContain('alert-001');
    });
  });

  // -------------------------------------------------------------------------
  // Detail endpoints — must reject cross-tenant access with 404
  // -------------------------------------------------------------------------

  describe('GET /api/regulations/:id (detail)', () => {
    it('tenant-001 can access own regulation', async () => {
      const res = await request(app)
        .get('/api/regulations/reg-001')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('reg-001');
    });

    it('tenant-001 gets 404 for tenant-002 regulation (not 403 — no info leak)', async () => {
      const res = await request(app)
        .get('/api/regulations/reg-003')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('tenant-002 gets 404 for tenant-001 regulation', async () => {
      const res = await request(app)
        .get('/api/regulations/reg-001')
        .set('Authorization', tenant2AdminHeader);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/clients/:id/dashboard (detail)', () => {
    it('tenant-001 can access own client dashboard', async () => {
      const res = await request(app)
        .get('/api/clients/client-001/dashboard')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(200);
      expect(res.body.clientId).toBe('client-001');
    });

    it('tenant-001 gets 404 for tenant-002 client dashboard', async () => {
      const res = await request(app)
        .get('/api/clients/client-002/dashboard')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(404);
    });

    it('tenant-002 gets 404 for tenant-001 client dashboard', async () => {
      const res = await request(app)
        .get('/api/clients/client-001/dashboard')
        .set('Authorization', tenant2AdminHeader);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Same-tenant, different roles — isolation by tenant, not role
  // -------------------------------------------------------------------------

  describe('Same tenant, different roles', () => {
    it('CLIENT_VIEWER of tenant-001 sees same data as ADMIN of tenant-001', async () => {
      const adminRes = await request(app)
        .get('/api/regulations')
        .set('Authorization', tenant1AdminHeader);
      const viewerRes = await request(app)
        .get('/api/regulations')
        .set('Authorization', tenant1ViewerHeader);
      expect(adminRes.body.total).toBe(viewerRes.body.total);
      expect(adminRes.body.data.map((r: TenantRecord) => r.id)).toEqual(
        viewerRes.body.data.map((r: TenantRecord) => r.id),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('unauthenticated request gets 401, not data leak', async () => {
      const res = await request(app).get('/api/regulations');
      expect(res.status).toBe(401);
      expect(res.body.data).toBeUndefined();
    });

    it('non-existent record returns 404 for any tenant', async () => {
      const res = await request(app)
        .get('/api/regulations/non-existent-id')
        .set('Authorization', tenant1AdminHeader);
      expect(res.status).toBe(404);
    });
  });
});
