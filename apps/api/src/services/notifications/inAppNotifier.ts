// ============================================================================
// FILE: apps/api/src/services/notifications/inAppNotifier.ts
// In-app notification channel via Server-Sent Events (SSE).
// Manages connected clients and pushes real-time alerts to the dashboard.
// ============================================================================

import type { Response } from 'express';
import { createServiceLogger } from '../../config/logger.js';
import type { NotificationChannel, NotificationPayload, NotificationResult } from './types.js';

const logger = createServiceLogger('notification:in-app');

/** SSE event types sent to the client. */
type SSEEventType = 'alert' | 'ping' | 'connected';

/** A connected SSE client. */
interface SSEClient {
  readonly id: string;
  readonly tenantId: string;
  readonly res: Response;
  readonly connectedAt: Date;
}

// Ping interval to keep connections alive (30 seconds).
const PING_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// InAppNotifier
// ---------------------------------------------------------------------------

export class InAppNotifier implements NotificationChannel {
  readonly name = 'SSE' as const;
  private readonly clients: Map<string, SSEClient> = new Map();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /** Start the ping interval to keep SSE connections alive. */
  start(): void {
    if (this.pingTimer) return;

    this.pingTimer = setInterval(() => {
      this.pingAll();
    }, PING_INTERVAL_MS);

    logger.info({
      operation: 'sse:started',
      pingIntervalMs: PING_INTERVAL_MS,
      result: 'success',
    });
  }

  /** Stop the ping interval and close all connections. */
  stop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    for (const [id, client] of this.clients) {
      client.res.end();
      this.clients.delete(id);
    }

    logger.info({
      operation: 'sse:stopped',
      result: 'success',
    });
  }

  // -------------------------------------------------------------------------
  // Client management
  // -------------------------------------------------------------------------

  /**
   * Register a new SSE client connection.
   * Sets up the response headers and keeps the connection open.
   */
  addClient(clientId: string, tenantId: string, res: Response): void {
    // Remove existing connection for this client (if any)
    const existing = this.clients.get(clientId);
    if (existing) {
      existing.res.end();
      this.clients.delete(clientId);
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    const client: SSEClient = {
      id: clientId,
      tenantId,
      res,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    // Send initial connection event
    this.sendEvent(res, 'connected', { clientId, timestamp: new Date().toISOString() });

    // Handle client disconnect
    res.on('close', () => {
      this.clients.delete(clientId);
      logger.debug({
        operation: 'sse:client_disconnected',
        clientId,
        tenantId,
        result: 'success',
      });
    });

    logger.info({
      operation: 'sse:client_connected',
      clientId,
      tenantId,
      totalClients: this.clients.size,
      result: 'success',
    });
  }

  /** Get the number of connected clients. */
  getConnectedCount(): number {
    return this.clients.size;
  }

  // -------------------------------------------------------------------------
  // Notification delivery
  // -------------------------------------------------------------------------

  /**
   * Send an alert to a specific client via SSE.
   * If the client is not connected, the alert is silently skipped
   * (they will see it in the dashboard on next load).
   */
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const startTime = Date.now();

    const client = this.clients.get(payload.clientId);

    if (!client) {
      logger.debug({
        operation: 'sse:send',
        alertId: payload.alertId,
        clientId: payload.clientId,
        duration: Date.now() - startTime,
        result: 'skipped',
        reason: 'Client not connected',
      });

      return {
        alertId: payload.alertId,
        channel: 'SSE',
        success: false,
        messageId: null,
        error: 'Client not connected via SSE',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const eventData = {
        alertId: payload.alertId,
        subject: payload.subject,
        impactLevel: payload.impactLevel,
        bodyText: payload.bodyText.slice(0, 500),
        timestamp: new Date().toISOString(),
      };

      this.sendEvent(client.res, 'alert', eventData);

      const duration = Date.now() - startTime;

      logger.info({
        operation: 'sse:send',
        alertId: payload.alertId,
        clientId: payload.clientId,
        duration,
        result: 'success',
      });

      return {
        alertId: payload.alertId,
        channel: 'SSE',
        success: true,
        messageId: payload.alertId,
        error: null,
        durationMs: duration,
      };
    } catch (err) {
      // Client probably disconnected — remove from map
      this.clients.delete(payload.clientId);

      const duration = Date.now() - startTime;

      logger.warn({
        operation: 'sse:send',
        alertId: payload.alertId,
        clientId: payload.clientId,
        duration,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        alertId: payload.alertId,
        channel: 'SSE',
        success: false,
        messageId: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: duration,
      };
    }
  }

  /**
   * Broadcast an alert to all connected clients in a tenant.
   * Used for tenant-wide notifications (e.g. new regulation affecting multiple clients).
   */
  broadcastToTenant(tenantId: string, event: SSEEventType, data: unknown): number {
    let sent = 0;

    for (const client of this.clients.values()) {
      if (client.tenantId === tenantId) {
        try {
          this.sendEvent(client.res, event, data);
          sent++;
        } catch {
          this.clients.delete(client.id);
        }
      }
    }

    return sent;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** Send an SSE event to a response stream. */
  private sendEvent(res: Response, event: SSEEventType, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /** Ping all connected clients to keep connections alive. */
  private pingAll(): void {
    const now = new Date().toISOString();
    const disconnected: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        this.sendEvent(client.res, 'ping', { timestamp: now });
      } catch {
        disconnected.push(id);
      }
    }

    for (const id of disconnected) {
      this.clients.delete(id);
    }

    if (disconnected.length > 0) {
      logger.debug({
        operation: 'sse:ping_cleanup',
        disconnectedClients: disconnected.length,
        remainingClients: this.clients.size,
      });
    }
  }
}
