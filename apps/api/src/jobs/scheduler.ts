// ============================================================================
// FILE: apps/api/src/jobs/scheduler.ts
// Ingestion scheduler — triggers connectors on configured intervals.
//
// Schedule:
//   Every 10 min  — SEC EDGAR (rate limit: 10 req/s, exponential backoff)
//   Every 1 hour  — EUR-Lex, BOE Spain
//   Every 24 hours — DOF Mexico (6am UTC), future LATAM connectors
//
// Implemented as a standalone process that can run as:
//   - Azure Functions timer trigger (production)
//   - setInterval-based loop (local dev / Container Apps)
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { IngestionJobResult } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';
import { SecEdgarConnector } from './ingestion/connectors/SecEdgarConnector.js';
import { EurLexConnector } from './ingestion/connectors/EurLexConnector.js';
import { BoeSpainConnector } from './ingestion/connectors/BoeSpainConnector.js';
import { DofMexicoConnector } from './ingestion/connectors/DofMexicoConnector.js';
import type { BaseIngestionJob } from './ingestion/BaseIngestionJob.js';

const logger = createServiceLogger('scheduler');

// ---------------------------------------------------------------------------
// Schedule configuration
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  readonly name: string;
  readonly connector: BaseIngestionJob;
  readonly intervalMs: number;
  /** UTC hour to run (for daily jobs). Null = run on interval only. */
  readonly runAtUtcHour: number | null;
  readonly enabled: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Dependencies injected at initialization
// ---------------------------------------------------------------------------

export interface SchedulerDeps {
  readonly embeddingFn: (text: string) => Promise<readonly number[]>;
  readonly idempotencyCheckFn: (source: string, documentId: string, version: string) => Promise<boolean>;
  readonly classifyFn: (
    title: string,
    summary: string,
    areas: readonly string[],
    changeType: string,
  ) => Promise<{ level: 'HIGH' | 'MEDIUM' | 'LOW'; reasoning: string; factors: readonly string[] }>;
  readonly serviceBusConnectionString: string;
  readonly queueName: string;
}

// ---------------------------------------------------------------------------
// IngestionScheduler
// ---------------------------------------------------------------------------

export class IngestionScheduler {
  private readonly schedule: ScheduleEntry[];
  private readonly timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly lastRun: Map<string, Date> = new Map();
  private readonly runningJobs: Set<string> = new Set();
  private isRunning = false;

  constructor(deps: SchedulerDeps, overrides: Partial<Record<string, boolean>> = {}) {
    // Initialize connectors
    const secEdgar = new SecEdgarConnector();
    const eurLex = new EurLexConnector();
    const boeSpain = new BoeSpainConnector();
    const dofMexico = new DofMexicoConnector();

    // Initialize all connectors with shared dependencies
    const connectors = [secEdgar, eurLex, boeSpain, dofMexico];
    for (const connector of connectors) {
      connector.initialize({
        embeddingFn: deps.embeddingFn,
        idempotencyCheckFn: deps.idempotencyCheckFn,
        classifyFn: deps.classifyFn,
        serviceBusConnectionString: deps.serviceBusConnectionString,
        queueName: deps.queueName,
      });
    }

    this.schedule = [
      {
        name: 'SEC_EDGAR',
        connector: secEdgar,
        intervalMs: 10 * MINUTE,
        runAtUtcHour: null,
        enabled: overrides['SEC_EDGAR'] ?? true,
      },
      {
        name: 'EUR_LEX',
        connector: eurLex,
        intervalMs: 1 * HOUR,
        runAtUtcHour: null,
        enabled: overrides['EUR_LEX'] ?? true,
      },
      {
        name: 'BOE_SPAIN',
        connector: boeSpain,
        intervalMs: 1 * HOUR,
        runAtUtcHour: null,
        enabled: overrides['BOE_SPAIN'] ?? true,
      },
      {
        name: 'DOF_MEXICO',
        connector: dofMexico,
        intervalMs: 1 * DAY,
        runAtUtcHour: 6, // 6am UTC
        enabled: overrides['DOF_MEXICO'] ?? true,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start all scheduled connectors. */
  start(): void {
    if (this.isRunning) return;

    logger.info({
      operation: 'scheduler:start',
      enabledConnectors: this.schedule.filter((s) => s.enabled).map((s) => s.name),
      result: 'success',
    });

    for (const entry of this.schedule) {
      if (!entry.enabled) {
        logger.info({
          operation: 'scheduler:connector_disabled',
          connector: entry.name,
          result: 'skipped',
        });
        continue;
      }

      if (entry.runAtUtcHour !== null) {
        // Daily jobs: calculate delay until next run time, then repeat every 24h
        this.scheduleDailyJob(entry);
      } else {
        // Interval jobs: run immediately then on interval
        this.scheduleIntervalJob(entry);
      }
    }

    this.isRunning = true;
  }

  /** Stop all scheduled connectors and clean up. */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      logger.debug({
        operation: 'scheduler:timer_cleared',
        connector: name,
      });
    }
    this.timers.clear();

    // Wait for running jobs to finish (max 30s)
    const timeout = Date.now() + 30_000;
    while (this.runningJobs.size > 0 && Date.now() < timeout) {
      await sleep(500);
    }

    // Dispose connectors
    for (const entry of this.schedule) {
      await entry.connector.dispose();
    }

    this.isRunning = false;

    logger.info({
      operation: 'scheduler:stopped',
      result: 'success',
    });
  }

  /** Trigger a specific connector manually (used by POST /api/ingest/trigger). */
  async triggerManual(connectorNames?: readonly string[]): Promise<readonly IngestionJobResult[]> {
    const requestId = randomUUID();
    const targets = connectorNames
      ? this.schedule.filter((s) => connectorNames.includes(s.name))
      : this.schedule.filter((s) => s.enabled);

    if (targets.length === 0) {
      logger.warn({
        operation: 'scheduler:trigger_manual',
        requestId,
        requestedConnectors: connectorNames ?? 'all',
        result: 'no_matching_connectors',
      });
      return [];
    }

    logger.info({
      operation: 'scheduler:trigger_manual',
      requestId,
      connectors: targets.map((t) => t.name),
      result: 'triggered',
    });

    const results = await Promise.allSettled(
      targets.map((entry) => this.runJob(entry)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<IngestionJobResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /** Get status of all connectors. */
  getStatus(): readonly ConnectorStatus[] {
    return this.schedule.map((entry) => ({
      name: entry.name,
      enabled: entry.enabled,
      intervalMs: entry.intervalMs,
      runAtUtcHour: entry.runAtUtcHour,
      isRunning: this.runningJobs.has(entry.name),
      lastRun: this.lastRun.get(entry.name) ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Internal scheduling
  // -------------------------------------------------------------------------

  private scheduleIntervalJob(entry: ScheduleEntry): void {
    // Run immediately on startup
    void this.runJob(entry);

    // Then repeat on interval
    const timer = setInterval(() => {
      void this.runJob(entry);
    }, entry.intervalMs);

    this.timers.set(entry.name, timer);

    logger.info({
      operation: 'scheduler:interval_registered',
      connector: entry.name,
      intervalMinutes: entry.intervalMs / MINUTE,
      result: 'success',
    });
  }

  private scheduleDailyJob(entry: ScheduleEntry): void {
    const delayMs = this.getDelayUntilUtcHour(entry.runAtUtcHour!);

    // First run: wait until the target hour
    const firstRunTimer = setTimeout(() => {
      void this.runJob(entry);

      // After first run, repeat every 24h
      const dailyTimer = setInterval(() => {
        void this.runJob(entry);
      }, DAY);

      this.timers.set(entry.name, dailyTimer);
    }, delayMs);

    // Store the timeout ref (cast to satisfy the Map type)
    this.timers.set(entry.name, firstRunTimer as unknown as ReturnType<typeof setInterval>);

    const nextRunDate = new Date(Date.now() + delayMs);
    logger.info({
      operation: 'scheduler:daily_registered',
      connector: entry.name,
      runAtUtcHour: entry.runAtUtcHour,
      nextRunAt: nextRunDate.toISOString(),
      delayMinutes: Math.round(delayMs / MINUTE),
      result: 'success',
    });
  }

  /** Calculate milliseconds until the next occurrence of a UTC hour. */
  private getDelayUntilUtcHour(targetHour: number): number {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(targetHour, 0, 0, 0);

    // If target time already passed today, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  // -------------------------------------------------------------------------
  // Job execution
  // -------------------------------------------------------------------------

  /** Execute a single ingestion job with concurrency guard. */
  private async runJob(entry: ScheduleEntry): Promise<IngestionJobResult> {
    const requestId = randomUUID();

    // Prevent concurrent execution of the same connector
    if (this.runningJobs.has(entry.name)) {
      logger.warn({
        operation: 'scheduler:skip_concurrent',
        requestId,
        connector: entry.name,
        result: 'skipped',
      });
      return {
        source: entry.name,
        documentsFound: 0,
        documentsNew: 0,
        documentsSkipped: 0,
        errors: [{ documentId: 'N/A', error: 'Previous run still in progress', retryable: true }],
        durationMs: 0,
      };
    }

    this.runningJobs.add(entry.name);
    const startTime = Date.now();

    try {
      const result = await entry.connector.run();
      this.lastRun.set(entry.name, new Date());

      logger.info({
        operation: 'scheduler:job_complete',
        requestId,
        connector: entry.name,
        documentsFound: result.documentsFound,
        documentsNew: result.documentsNew,
        documentsSkipped: result.documentsSkipped,
        errorsCount: result.errors.length,
        duration: Date.now() - startTime,
        result: result.errors.length > 0 ? 'partial' : 'success',
      });

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;

      logger.error({
        operation: 'scheduler:job_failed',
        requestId,
        connector: entry.name,
        duration,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        source: entry.name,
        documentsFound: 0,
        documentsNew: 0,
        documentsSkipped: 0,
        errors: [{
          documentId: 'N/A',
          error: err instanceof Error ? err.message : String(err),
          retryable: true,
        }],
        durationMs: duration,
      };
    } finally {
      this.runningJobs.delete(entry.name);
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectorStatus {
  readonly name: string;
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly runAtUtcHour: number | null;
  readonly isRunning: boolean;
  readonly lastRun: Date | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Azure Functions entry point (production)
// ---------------------------------------------------------------------------

/**
 * Azure Functions timer trigger handler.
 * Use this when deploying as a standalone Azure Function.
 *
 * Example function.json:
 * {
 *   "bindings": [{
 *     "name": "timer",
 *     "type": "timerTrigger",
 *     "direction": "in",
 *     "schedule": "0 *\/10 * * * *"
 *   }]
 * }
 */
export async function azureFunctionHandler(
  _timer: { isPastDue: boolean },
  deps: SchedulerDeps,
  connectorNames?: readonly string[],
): Promise<readonly IngestionJobResult[]> {
  const scheduler = new IngestionScheduler(deps);
  const results = await scheduler.triggerManual(connectorNames);
  await scheduler.stop();
  return results;
}
