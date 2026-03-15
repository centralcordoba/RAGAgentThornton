// ============================================================================
// FILE: apps/api/src/routes/ingestion.ts
// POST /api/ingest/trigger — manual ingestion trigger.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { TriggerIngestionSchema } from '@regwatch/shared';
import { AppError, Errors } from '@regwatch/shared';
import type { IngestionScheduler } from '../jobs/scheduler.js';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:ingestion');

export interface IngestionRouteDeps {
  readonly scheduler: IngestionScheduler;
}

export function createIngestionRouter(deps: IngestionRouteDeps): Router {
  const router = Router();

  router.post('/ingest/trigger', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string ?? randomUUID();
    const startTime = Date.now();

    // Validate body
    const parsed = TriggerIngestionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.validation(requestId, parsed.error.issues);
    }

    const { sources, countries } = parsed.data;

    // Determine which connectors to trigger
    let connectorNames: string[] | undefined;
    if (sources && sources.length > 0) {
      connectorNames = sources;
    } else if (countries && countries.length > 0) {
      // Map countries to connector names
      const countryConnectorMap: Record<string, string> = {
        US: 'SEC_EDGAR',
        EU: 'EUR_LEX',
        ES: 'BOE_SPAIN',
        MX: 'DOF_MEXICO',
      };
      connectorNames = countries
        .map((c) => countryConnectorMap[c])
        .filter((name): name is string => name !== undefined);
    }

    logger.info({
      operation: 'ingest:trigger',
      requestId,
      sources: connectorNames ?? 'all',
      triggeredBy: req.headers['x-user-id'] ?? 'unknown',
    });

    // Trigger asynchronously — return 202 immediately
    const jobId = randomUUID();

    // Fire and forget — results are logged by the scheduler
    void deps.scheduler.triggerManual(connectorNames).then((results) => {
      logger.info({
        operation: 'ingest:trigger_complete',
        requestId,
        jobId,
        results: results.map((r) => ({
          source: r.source,
          found: r.documentsFound,
          new: r.documentsNew,
          skipped: r.documentsSkipped,
          errors: r.errors.length,
        })),
        duration: Date.now() - startTime,
        result: 'success',
      });
    });

    res.status(202).json({
      jobId,
      status: 'accepted',
      sourcesTriggered: connectorNames ?? ['all'],
      message: `Ingestion triggered for ${connectorNames?.length ?? 'all'} sources`,
    });
  });

  return router;
}
