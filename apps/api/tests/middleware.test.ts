// ============================================================================
// FILE: apps/api/tests/middleware.test.ts
// Tests for auth, RBAC, rate limiter, and error handler middleware.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { AppError, Errors } from '@regwatch/shared';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { createRbacMiddleware } from '../src/middleware/rbac.js';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { createRequestIdMiddleware } from '../src/middleware/requestId.js';
import { getAuthHeader, TEST_USERS, TEST_JWT_SECRET } from './helpers/testAuth.js';

// Set env for auth middleware
process.env['JWT_SECRET'] = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  function createApp() {
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(createAuthMiddleware());
    app.get('/api/test', (_req: Request, res: Response) => {
      const authReq = _req as Request & { tenantId: string; userId: string; userRole: string };
      res.json({
        tenantId: authReq.tenantId,
        userId: authReq.userId,
        role: authReq.userRole,
      });
    });
    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });
    return app;
  }

  it('rejects requests without Authorization header', async () => {
    const res = await request(createApp()).get('/api/test');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.requestId).toBeTruthy();
  });

  it('rejects requests with invalid token', async () => {
    const res = await request(createApp())
      .get('/api/test')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('accepts valid JWT and attaches auth context', async () => {
    const res = await request(createApp())
      .get('/api/test')
      .set('Authorization', getAuthHeader(TEST_USERS.admin));
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('tenant-001');
    expect(res.body.userId).toBe('user-admin-001');
    expect(res.body.role).toBe('ADMIN');
  });

  it('skips auth for /health endpoint', async () => {
    // Auth middleware skips when req.path === '/health'.
    // In the real server, auth is mounted at '/api', so req.path is '/health'.
    // In this test, auth is mounted at root, so we call '/health' directly.
    const appWithHealth = express();
    appWithHealth.use(createRequestIdMiddleware());
    appWithHealth.use(createAuthMiddleware());
    appWithHealth.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });
    const res = await request(appWithHealth).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// RBAC middleware
// ---------------------------------------------------------------------------

describe('rbacMiddleware', () => {
  function createApp(allowedRoles: readonly string[]) {
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(createAuthMiddleware());
    app.use(createRbacMiddleware(allowedRoles as readonly ('ADMIN' | 'PROFESSIONAL' | 'CLIENT_VIEWER')[]));
    app.get('/api/test', (_req: Request, res: Response) => res.json({ access: 'granted' }));
    return app;
  }

  it('allows ADMIN access to ADMIN-only route', async () => {
    const res = await request(createApp(['ADMIN']))
      .get('/api/test')
      .set('Authorization', getAuthHeader(TEST_USERS.admin));
    expect(res.status).toBe(200);
  });

  it('denies CLIENT_VIEWER access to ADMIN-only route', async () => {
    const res = await request(createApp(['ADMIN']))
      .get('/api/test')
      .set('Authorization', getAuthHeader(TEST_USERS.clientViewer));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows PROFESSIONAL access to PROFESSIONAL+ADMIN route', async () => {
    const res = await request(createApp(['ADMIN', 'PROFESSIONAL']))
      .get('/api/test')
      .set('Authorization', getAuthHeader(TEST_USERS.professional));
    expect(res.status).toBe(200);
  });

  it('allows CLIENT_VIEWER access to route open to all roles', async () => {
    const res = await request(createApp(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']))
      .get('/api/test')
      .set('Authorization', getAuthHeader(TEST_USERS.clientViewer));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

describe('rateLimiter', () => {
  function createApp(maxRequests: number, windowMs: number) {
    const app = express();
    app.use(createRequestIdMiddleware());
    app.use(createRateLimiter({ maxRequests, windowMs }));
    app.get('/api/test', (_req: Request, res: Response) => res.json({ ok: true }));
    return app;
  }

  it('allows requests within the limit', async () => {
    const app = createApp(3, 60_000);
    const res1 = await request(app).get('/api/test');
    const res2 = await request(app).get('/api/test');
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('blocks requests exceeding the limit', async () => {
    const app = createApp(2, 60_000);
    await request(app).get('/api/test');
    await request(app).get('/api/test');
    const res3 = await request(app).get('/api/test');
    expect(res3.status).toBe(429);
    expect(res3.body.code).toBe('RATE_LIMITED');
    expect(res3.headers['retry-after']).toBeTruthy();
  });

  it('includes rate limit headers', async () => {
    const app = createApp(10, 60_000);
    const res = await request(app).get('/api/test');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBe('9');
  });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  function createApp() {
    const app = express();
    app.use(express.json());
    app.use(createRequestIdMiddleware());

    app.get('/api/app-error', (_req: Request) => {
      throw Errors.notFound(_req.requestId, 'Thing', 'xyz');
    });
    app.get('/api/unexpected', () => {
      throw new Error('unexpected boom');
    });
    app.post('/api/json', (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    app.use(createErrorHandler());
    return app;
  }

  it('handles AppError with correct status and format', async () => {
    const res = await request(createApp()).get('/api/app-error');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toContain('xyz');
    expect(res.body.requestId).toBeTruthy();
  });

  it('handles unexpected errors as 500 without leaking details', async () => {
    const res = await request(createApp()).get('/api/unexpected');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('An unexpected error occurred');
    expect(res.body.message).not.toContain('boom');
  });

  it('handles invalid JSON body', async () => {
    const res = await request(createApp())
      .post('/api/json')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });
});
