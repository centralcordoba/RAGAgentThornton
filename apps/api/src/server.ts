// ============================================================================
// FILE: apps/api/src/server.ts
// RegWatch AI — Express API server entry point.
// Wires all routes, middleware, and services together.
// ============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
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
  createMapRouter,
  createHorizonRouter,
} from './routes/index.js';
import {
  createAuthMiddleware,
  createRbacMiddleware,
  createRateLimiter,
  createErrorHandler,
  createRequestIdMiddleware,
  createAuditLogMiddleware,
} from './middleware/index.js';
import type { HealthDeps } from './routes/health.js';

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

// --- Global middleware ---
app.use(helmet());

// CORS: In staging/prod, CORS_ORIGIN is required — no '*' fallback.
const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const corsOrigin = process.env['CORS_ORIGIN'];

if ((nodeEnv === 'staging' || nodeEnv === 'production') && !corsOrigin) {
  throw new Error(
    'CORS_ORIGIN environment variable is required in staging/production. ' +
    'Set it to the allowed origin (e.g., https://ca-web-regwatch-prod.azurecontainerapps.io).',
  );
}

app.use(cors({
  origin: corsOrigin ?? (nodeEnv === 'development' ? '*' : undefined),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(createRequestIdMiddleware());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

// ---------------------------------------------------------------------------
// Service initialization
// ---------------------------------------------------------------------------

/**
 * Initialize external service connections.
 * Uses dynamic imports to avoid requiring built packages at startup.
 * Returns null for services whose env vars are not configured (dev without docker).
 */
async function initServices(): Promise<{
  prisma: unknown;
  redisCache: unknown;
  neo4j: unknown;
}> {
  let prisma: unknown = null;
  let redisCache: unknown = null;
  let neo4j: unknown = null;
  let graphService: unknown = null;

  // PostgreSQL (via Prisma)
  if (process.env['DATABASE_URL']) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient({
        log: nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
      });
      logger.info({ service: 'api', operation: 'init:prisma', result: 'configured' });
    } catch (err) {
      logger.warn({ service: 'api', operation: 'init:prisma', result: 'import_failed', error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.warn({ service: 'api', operation: 'init:prisma', result: 'skipped', reason: 'DATABASE_URL not set' });
  }

  // Redis
  if (process.env['REDIS_URL']) {
    try {
      const { RedisCache } = await import('@regwatch/ai-core');
      redisCache = new RedisCache(process.env['REDIS_URL']!);
      logger.info({ service: 'api', operation: 'init:redis', result: 'configured' });
    } catch (err) {
      // Fallback: create a minimal Redis connection for health checks
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env['REDIS_URL']!, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          retryStrategy(times: number): number | null {
            if (times > 2) return null;
            return Math.min(times * 200, 1000);
          },
        });
        redis.on('error', () => {}); // Suppress unhandled error events
        redisCache = {
          ping: () => redis.ping().then(() => true).catch(() => false),
          connect: () => redis.connect().catch(() => {}),
          disconnect: () => redis.quit().catch(() => {}),
        };
        logger.info({ service: 'api', operation: 'init:redis', result: 'configured_fallback' });
      } catch {
        logger.warn({ service: 'api', operation: 'init:redis', result: 'import_failed', error: err instanceof Error ? err.message : String(err) });
      }
    }
  } else {
    logger.warn({ service: 'api', operation: 'init:redis', result: 'skipped', reason: 'REDIS_URL not set' });
  }

  // Neo4j
  const neo4jUri = process.env['NEO4J_URI'];
  const neo4jUser = process.env['NEO4J_USER'] ?? 'neo4j';
  const neo4jPassword = process.env['NEO4J_PASSWORD'];
  if (neo4jUri && neo4jPassword) {
    try {
      const { Neo4jClient } = await import('./graph/neo4jClient.js');
      neo4j = new Neo4jClient(neo4jUri, neo4jUser, neo4jPassword);
      logger.info({ service: 'api', operation: 'init:neo4j', result: 'configured' });

      // Create ComplianceGraphService
      try {
        const { ComplianceGraphService } = await import('./graph/complianceGraph.js');
        graphService = new ComplianceGraphService(neo4j);
        logger.info({ service: 'api', operation: 'init:graph_service', result: 'configured' });
      } catch (gsErr) {
        logger.warn({ service: 'api', operation: 'init:graph_service', result: 'failed', error: gsErr instanceof Error ? gsErr.message : String(gsErr) });
      }
    } catch (err) {
      logger.warn({ service: 'api', operation: 'init:neo4j', result: 'import_failed', error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.warn({ service: 'api', operation: 'init:neo4j', result: 'skipped', reason: 'NEO4J_URI or NEO4J_PASSWORD not set' });
  }

  // RAG Engine (Azure OpenAI + AI Search)
  let ragEngine: unknown = null;
  const aoaiEndpoint = process.env['AZURE_OPENAI_ENDPOINT'];
  const aoaiKey = process.env['AZURE_OPENAI_API_KEY'];
  const searchEndpoint = process.env['AZURE_SEARCH_ENDPOINT'];
  const searchKey = process.env['AZURE_SEARCH_API_KEY'];

  if (aoaiEndpoint && aoaiKey && searchEndpoint && searchKey) {
    try {
      const { RegulatoryRAG } = await import('@regwatch/ai-core');
      const { OpenAI } = await import('openai');

      const openai = new OpenAI({
        apiKey: aoaiKey,
        baseURL: `${aoaiEndpoint}/openai/deployments/${process.env['AZURE_OPENAI_DEPLOYMENT_CHAT'] ?? process.env['AZURE_OPENAI_GPT_DEPLOYMENT'] ?? 'gpt-4o'}`,
        defaultQuery: { 'api-version': process.env['AZURE_OPENAI_API_VERSION'] ?? '2024-06-01' },
        defaultHeaders: { 'api-key': aoaiKey },
      });

      const embeddingDeployment = process.env['AZURE_OPENAI_DEPLOYMENT_EMBEDDINGS'] ?? process.env['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] ?? 'text-embedding-3-large';

      const embeddingClient = new OpenAI({
        apiKey: aoaiKey,
        baseURL: `${aoaiEndpoint}/openai/deployments/${embeddingDeployment}`,
        defaultQuery: { 'api-version': process.env['AZURE_OPENAI_API_VERSION'] ?? '2024-06-01' },
        defaultHeaders: { 'api-key': aoaiKey },
      });

      ragEngine = new RegulatoryRAG(
        {
          azureOpenAIEndpoint: aoaiEndpoint,
          azureOpenAIApiKey: aoaiKey,
          azureOpenAIApiVersion: process.env['AZURE_OPENAI_API_VERSION'] ?? '2024-06-01',
          gptDeployment: process.env['AZURE_OPENAI_DEPLOYMENT_CHAT'] ?? 'gpt-4o',
          embeddingDeployment,
          searchEndpoint,
          searchApiKey: searchKey,
          searchIndexName: process.env['AZURE_SEARCH_INDEX_NAME'] ?? 'regulatory-documents',
        },
        {
          generateEmbedding: async (text: string) => {
            const res = await embeddingClient.embeddings.create({ model: embeddingDeployment, input: text });
            return res.data[0]!.embedding;
          },
          cacheGet: async () => null, // Redis cache handled separately
          cacheSet: async () => {},
          getClientObligations: async () => [],
          chatCompletion: async (params: { systemPrompt: string; userMessage: string; maxTokens: number; temperature: number }) => {
            const res = await openai.chat.completions.create({
              model: process.env['AZURE_OPENAI_DEPLOYMENT_CHAT'] ?? 'gpt-4o',
              messages: [
                { role: 'system', content: params.systemPrompt },
                { role: 'user', content: params.userMessage },
              ],
              max_tokens: params.maxTokens,
              temperature: params.temperature,
            });
            return res.choices[0]?.message?.content ?? '';
          },
        },
      );

      logger.info({ service: 'api', operation: 'init:rag_engine', result: 'configured' });
    } catch (err) {
      logger.warn({ service: 'api', operation: 'init:rag_engine', result: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.warn({ service: 'api', operation: 'init:rag_engine', result: 'skipped', reason: 'Azure OpenAI or AI Search env vars not set' });
  }

  return { prisma, redisCache, neo4j, graphService, ragEngine };
}

// ---------------------------------------------------------------------------
// Wire routes with real or null dependencies
// ---------------------------------------------------------------------------

// Services holder — initialized in start()
let services: { prisma: unknown; redisCache: unknown; neo4j: unknown } = {
  prisma: null,
  redisCache: null,
  neo4j: null,
};

// --- Health check (no auth required) ---
// Uses a closure so it reads the current services state (populated after init)
app.use('/api', (() => {
  const router = createHealthRouter({
    get prisma() { return services.prisma as HealthDeps['prisma']; },
    get redis() { return services.redisCache as HealthDeps['redis']; },
    get neo4j() { return services.neo4j as HealthDeps['neo4j']; },
  });
  return router;
})());

// --- Auth + RBAC middleware (all routes below require auth) ---
app.use('/api', createAuthMiddleware());
app.use('/api', createAuditLogMiddleware());

// --- Rate limiting ---
app.use('/api/chat', createRateLimiter({ maxRequests: 10, windowMs: 60_000 }));
app.use('/api', createRateLimiter({ maxRequests: 100, windowMs: 60_000 }));

// --- API routes ---
// Use getters so routes access the initialized services (populated in start())
const lazyPrisma = { get prisma() { return services.prisma as never; } };

app.use('/api', createIngestionRouter({ scheduler: null as never }));
app.use('/api', createRegulationsRouter({
  get prisma() { return services.prisma as never; },
  get ragEngine() { return (services as Record<string, unknown>)['ragEngine'] as never ?? null; },
  get redisCache() { return services.redisCache as never; },
  graphService: null as never,
}));
app.use('/api', createClientsRouter({
  get prisma() { return services.prisma as never; },
  get graphService() { return (services as Record<string, unknown>)['graphService'] as never ?? null; },
  onboardingEngine: null,
}));
app.use('/api', createChatRouter({
  get prisma() { return services.prisma as never; },
  get ragEngine() { return (services as Record<string, unknown>)['ragEngine'] as never ?? null; },
  complianceAgent: null as never,
}));
app.use('/api', createAlertsRouter({ get prisma() { return services.prisma as never; } }));
app.use('/api', createSourcesRouter({ get prisma() { return services.prisma as never; } }));
app.use('/api', createImpactRouter({ get prisma() { return services.prisma as never; } }));
app.use('/api', createCalendarRouter({ get prisma() { return services.prisma as never; } }));
app.use('/api', createMapRouter({ get prisma() { return services.prisma as never; } }));
app.use('/api', createHorizonRouter({ get prisma() { return services.prisma as never; } }));

// RBAC guards for specific routes
app.use('/api/ingest', createRbacMiddleware(['ADMIN', 'PROFESSIONAL']));
app.use('/api/sources', createRbacMiddleware(['ADMIN']));
app.use('/api/impact', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));
app.use('/api/calendar', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));
app.use('/api/clients', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));
app.use('/api/map', createRbacMiddleware(['ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER']));

// --- Error handler (must be last) ---
app.use(createErrorHandler());

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  try {
    logger.info({
      service: 'api',
      operation: 'server:starting',
      port: PORT,
      nodeEnv,
    });

    // Initialize services (connects to PG, Redis, Neo4j if env vars are set)
    services = await initServices();

    // Connect services that were successfully initialized
    const connectPromises: Promise<void>[] = [];

    if (services.prisma && typeof (services.prisma as Record<string, unknown>)['$connect'] === 'function') {
      connectPromises.push(
        (services.prisma as { $connect(): Promise<void> }).$connect().then(() => {
          logger.info({ service: 'api', operation: 'prisma:connected', result: 'success' });
        }).catch((err: unknown) => {
          logger.error({ service: 'api', operation: 'prisma:connect', result: 'error', error: err instanceof Error ? err.message : String(err) });
        }),
      );
    }

    if (services.redisCache && typeof (services.redisCache as Record<string, unknown>)['connect'] === 'function') {
      connectPromises.push(
        (services.redisCache as { connect(): Promise<void> }).connect().then(() => {
          logger.info({ service: 'api', operation: 'redis:connected', result: 'success' });
        }).catch((err: unknown) => {
          logger.error({ service: 'api', operation: 'redis:connect', result: 'error', error: err instanceof Error ? err.message : String(err) });
        }),
      );
    }

    if (services.neo4j && typeof (services.neo4j as Record<string, unknown>)['initialize'] === 'function') {
      connectPromises.push(
        (services.neo4j as { initialize(): Promise<void> }).initialize().then(() => {
          logger.info({ service: 'api', operation: 'neo4j:connected', result: 'success' });
        }).catch((err: unknown) => {
          logger.error({ service: 'api', operation: 'neo4j:connect', result: 'error', error: err instanceof Error ? err.message : String(err) });
        }),
      );
    }

    // Start listening FIRST, then connect services in background
    // This prevents EADDRINUSE when Neo4j takes 14+ seconds to connect
    const server = app.listen(PORT, () => {
      logger.info({
        service: 'api',
        operation: 'server:started',
        port: PORT,
        result: 'success',
      });
    });

    let retryCount = 0;
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && retryCount < 3) {
        retryCount++;
        logger.warn({ service: 'api', operation: 'server:port_in_use', port: PORT, retry: retryCount, result: 'retry' });
        setTimeout(() => {
          server.close();
          server.listen(PORT);
        }, 1000 * retryCount);
      } else if (err.code === 'EADDRINUSE') {
        logger.fatal({ service: 'api', operation: 'server:port_in_use', port: PORT, result: 'giving_up' });
        process.exit(1);
      } else {
        throw err;
      }
    });

    // Connect services in background (server already accepting requests)
    void Promise.allSettled(connectPromises).then(() => {
      logger.info({
        service: 'api',
        operation: 'services:connected',
        services: {
          prisma: services.prisma ? 'configured' : 'not_configured',
          redis: services.redisCache ? 'configured' : 'not_configured',
          neo4j: services.neo4j ? 'configured' : 'not_configured',
        },
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
async function shutdown(): Promise<void> {
  logger.info({ service: 'api', operation: 'server:shutting_down' });
  const p = services.prisma as Record<string, unknown> | null;
  const r = services.redisCache as Record<string, unknown> | null;
  const n = services.neo4j as Record<string, unknown> | null;
  if (p && typeof p['$disconnect'] === 'function') await (p['$disconnect'] as () => Promise<void>)().catch(() => {});
  if (r && typeof r['disconnect'] === 'function') await (r['disconnect'] as () => Promise<void>)().catch(() => {});
  if (n && typeof n['close'] === 'function') await (n['close'] as () => Promise<void>)().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });

start();

export { app };
