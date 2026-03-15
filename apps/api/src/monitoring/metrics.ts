// ============================================================================
// FILE: apps/api/src/monitoring/metrics.ts
// Custom metrics exported to Azure Application Insights.
//
// Metrics:
//   documents_ingested     — counter by source
//   changes_detected       — counter by impactLevel
//   alerts_generated       — counter by severity + channel
//   rag_queries            — counter by result (success/insufficient_data/error)
//   rag_latency_ms         — histogram (p50, p95, p99)
//   cache_hit_rate         — gauge for Redis
//   hitl_pending           — gauge of HIGH alerts awaiting review
// ============================================================================

import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('monitoring:metrics');

// ---------------------------------------------------------------------------
// Metric store (in-memory counters + histograms)
// Exported to Application Insights via flush()
// ---------------------------------------------------------------------------

interface CounterMetric {
  readonly name: string;
  readonly dimensions: Record<string, string>;
  value: number;
}

interface HistogramMetric {
  readonly name: string;
  readonly values: number[];
}

interface GaugeMetric {
  readonly name: string;
  value: number;
}

class MetricsRegistry {
  private readonly counters = new Map<string, CounterMetric>();
  private readonly histograms = new Map<string, HistogramMetric>();
  private readonly gauges = new Map<string, GaugeMetric>();
  private appInsightsClient: AppInsightsClient | null = null;

  initialize(connectionString: string): void {
    if (!connectionString) {
      logger.warn({
        operation: 'metrics:initialize',
        result: 'skipped',
        reason: 'No Application Insights connection string',
      });
      return;
    }

    this.appInsightsClient = new AppInsightsClient(connectionString);

    // Flush metrics every 60 seconds
    setInterval(() => {
      void this.flush();
    }, 60_000);

    logger.info({
      operation: 'metrics:initialize',
      result: 'success',
    });
  }

  // -------------------------------------------------------------------------
  // Counter operations
  // -------------------------------------------------------------------------

  increment(name: string, dimensions: Record<string, string> = {}, value = 1): void {
    const key = `${name}:${JSON.stringify(dimensions)}`;
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(key, { name, dimensions, value });
    }
  }

  // -------------------------------------------------------------------------
  // Histogram operations
  // -------------------------------------------------------------------------

  recordHistogram(name: string, value: number): void {
    const existing = this.histograms.get(name);
    if (existing) {
      existing.values.push(value);
      // Keep last 1000 values
      if (existing.values.length > 1000) {
        existing.values.splice(0, existing.values.length - 1000);
      }
    } else {
      this.histograms.set(name, { name, values: [value] });
    }
  }

  // -------------------------------------------------------------------------
  // Gauge operations
  // -------------------------------------------------------------------------

  setGauge(name: string, value: number): void {
    const existing = this.gauges.get(name);
    if (existing) {
      existing.value = value;
    } else {
      this.gauges.set(name, { name, value });
    }
  }

  // -------------------------------------------------------------------------
  // Flush to Application Insights
  // -------------------------------------------------------------------------

  async flush(): Promise<void> {
    if (!this.appInsightsClient) return;

    // Counters
    for (const [key, counter] of this.counters) {
      if (counter.value === 0) continue;
      this.appInsightsClient.trackMetric(counter.name, counter.value, counter.dimensions);
      counter.value = 0;
    }

    // Histograms — compute percentiles
    for (const [, hist] of this.histograms) {
      if (hist.values.length === 0) continue;

      const sorted = [...hist.values].sort((a, b) => a - b);
      const p50 = percentile(sorted, 50);
      const p95 = percentile(sorted, 95);
      const p99 = percentile(sorted, 99);

      this.appInsightsClient.trackMetric(`${hist.name}.p50`, p50, {});
      this.appInsightsClient.trackMetric(`${hist.name}.p95`, p95, {});
      this.appInsightsClient.trackMetric(`${hist.name}.p99`, p99, {});
      this.appInsightsClient.trackMetric(`${hist.name}.count`, sorted.length, {});

      hist.values.length = 0;
    }

    // Gauges
    for (const [, gauge] of this.gauges) {
      this.appInsightsClient.trackMetric(gauge.name, gauge.value, {});
    }

    logger.debug({
      operation: 'metrics:flush',
      counters: this.counters.size,
      histograms: this.histograms.size,
      gauges: this.gauges.size,
      result: 'success',
    });
  }

  // -------------------------------------------------------------------------
  // Snapshot for health endpoint
  // -------------------------------------------------------------------------

  getSnapshot(): MetricsSnapshot {
    const ragHist = this.histograms.get('rag_latency_ms');
    const sorted = ragHist ? [...ragHist.values].sort((a, b) => a - b) : [];

    return {
      documentsIngested: sumCounters(this.counters, 'documents_ingested'),
      changesDetected: sumCounters(this.counters, 'changes_detected'),
      alertsGenerated: sumCounters(this.counters, 'alerts_generated'),
      ragQueries: sumCounters(this.counters, 'rag_queries'),
      ragLatencyP95: sorted.length > 0 ? percentile(sorted, 95) : 0,
      cacheHitRate: this.gauges.get('cache_hit_rate')?.value ?? 0,
      hitlPending: this.gauges.get('hitl_pending')?.value ?? 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const metrics = new MetricsRegistry();

// ---------------------------------------------------------------------------
// Typed metric helpers
// ---------------------------------------------------------------------------

export const MetricNames = {
  documentsIngested: 'documents_ingested',
  changesDetected: 'changes_detected',
  alertsGenerated: 'alerts_generated',
  ragQueries: 'rag_queries',
  ragLatency: 'rag_latency_ms',
  cacheHitRate: 'cache_hit_rate',
  hitlPending: 'hitl_pending',
} as const;

export function trackIngestion(source: string, count: number): void {
  metrics.increment(MetricNames.documentsIngested, { source }, count);
}

export function trackChangeDetected(impactLevel: string): void {
  metrics.increment(MetricNames.changesDetected, { impactLevel });
}

export function trackAlertGenerated(severity: string, channel: string): void {
  metrics.increment(MetricNames.alertsGenerated, { severity, channel });
}

export function trackRAGQuery(result: 'success' | 'insufficient_data' | 'error'): void {
  metrics.increment(MetricNames.ragQueries, { result });
}

export function trackRAGLatency(durationMs: number): void {
  metrics.recordHistogram(MetricNames.ragLatency, durationMs);
}

export function updateCacheHitRate(rate: number): void {
  metrics.setGauge(MetricNames.cacheHitRate, rate);
}

export function updateHITLPending(count: number): void {
  metrics.setGauge(MetricNames.hitlPending, count);
}

// ---------------------------------------------------------------------------
// Snapshot type
// ---------------------------------------------------------------------------

export interface MetricsSnapshot {
  readonly documentsIngested: number;
  readonly changesDetected: number;
  readonly alertsGenerated: number;
  readonly ragQueries: number;
  readonly ragLatencyP95: number;
  readonly cacheHitRate: number;
  readonly hitlPending: number;
}

// ---------------------------------------------------------------------------
// Application Insights client wrapper
// ---------------------------------------------------------------------------

class AppInsightsClient {
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  trackMetric(name: string, value: number, dimensions: Record<string, string>): void {
    // In production: use @azure/monitor-opentelemetry-exporter
    // For now, log structured metrics that Application Insights auto-collects via pino
    logger.info({
      operation: 'metrics:track',
      metricName: name,
      metricValue: value,
      ...dimensions,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: readonly number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function sumCounters(counters: Map<string, CounterMetric>, name: string): number {
  let sum = 0;
  for (const counter of counters.values()) {
    if (counter.name === name) sum += counter.value;
  }
  return sum;
}
