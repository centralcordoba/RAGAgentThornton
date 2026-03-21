// ============================================================================
// FILE: apps/api/src/server.ts
// RegWatch AI — Express API server entry point.
// Wires all routes, middleware, and services together.
// ============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { AppError } from '@regwatch/shared';
import { logger } from './config/logger.js';
import {
  createHealthRouter,
  createIngestionRouter,
  createRegulationsRouter,
  createClientsRouter,
  createChatRouter,
  createAlertsRouter,
  createSourcesRouter,
  createImpactRouter,
  createCalendarRouter,
} from './routes/index.js';
import {
  createAuthMiddleware,
  createRbacMiddleware,
  createRateLimiter,
  createErrorHandler,
  createRequestIdMiddleware,
  createAuditLogMiddleware,
} from './middleware/index.js';

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

// --- Global middleware ---
app.use(helmet());
app.use(cors({
  origin: process.env['CORS_ORIGIN'] ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(createRequestIdMiddleware());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

// --- Health check (no auth required) ---
// Note: deps will be injected after service initialization
// For now, create placeholder that will be replaced at startup
app.use('/api', createHealthRouter({
  prisma: null as never,
  redis: null as never,
  neo4j: null as never,
}));

// --- Auth + RBAC middleware (all routes below require auth) ---
app.use('/api', createAuthMiddleware());
app.use('/api', createAuditLogMiddleware());

// --- Rate limiting ---
app.use('/api/chat', createRateLimiter({ maxRequests: 10, windowMs: 60_000 }));
app.use('/api', createRateLimiter({ maxRequests: 100, windowMs: 60_000 }));

// --- API routes ---
// Note: these use placeholder deps — real deps injected via initializeServer()
app.use('/api', createIngestionRouter({ scheduler: null as never }));
app.use('/api', createRegulationsRouter({
  prisma: null as never,
  ragEngine: null as never,
  redisCache: null as never,
  graphService: null as never,
}));
app.use('/api', createClientsRouter({
  prisma: null as never,
  graphService: null as never,
  onboardingEngine: null as never,
}));
app.use('/api', createChatRouter({
  prisma: null as never,
  ragEngine: null as never,
  complianceAgent: null as never,
}));
app.use('/api', createAlertsRouter({ prisma: null as never }));
app.use('/api', createSourcesRouter({ scheduler: null as never }));
app.use('/api', createImpactRouter({ prisma: null as never }));
app.use('/api', createCalendarRouter({ prisma: null as never }));

// RBAC guards for specific routes
app.use('/api/ingest', createRbacMiddleware(['ADMIN', 'PROFESSIONAL']));
app.use('/api/sources', createRbacMiddleware(['ADMIN']));
app.use('/api/impact', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));
app.use('/api/calendar', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));
app.use('/api/clients', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));

// --- Error handler (must be last) ---
app.use(createErrorHandler());

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

/**
 * Initialize all services and start the server.
 * In production, this wires real dependencies.
 * For now, starts with minimal setup.
 */
async function start(): Promise<void> {
  try {
    logger.info({
      service: 'api',
      operation: 'server:starting',
      port: PORT,
      nodeEnv: process.env['NODE_ENV'] ?? 'development',
    });

    app.listen(PORT, () => {
      logger.info({
        service: 'api',
        operation: 'server:started',
        port: PORT,
        result: 'success',
      });
    });
  } catch (err) {
    logger.fatal({
      service: 'api',
      operation: 'server:start_failed',
      error: err instanceof Error ? err.message : String(err),
      result: 'fatal',
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info({ service: 'api', operation: 'server:shutting_down' });
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info({ service: 'api', operation: 'server:shutting_down' });
  process.exit(0);
});

start();

export { app };
