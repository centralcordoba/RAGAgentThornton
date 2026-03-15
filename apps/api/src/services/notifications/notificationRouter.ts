// ============================================================================
// FILE: apps/api/src/services/notifications/notificationRouter.ts
// Routes alerts to the correct notification channel(s) based on:
//   - Client preferences (email, teams, in-app, or all)
//   - Rate limiting (max 3 alerts per client per hour)
//   - Escalation (HIGH + no ack in 2h → escalate to manager)
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Alert, AlertChannel } from '@regwatch/shared';
import { createServiceLogger } from '../../config/logger.js';
import type { EmailNotifier } from './emailNotifier.js';
import type { TeamsNotifier } from './teamsNotifier.js';
import type { InAppNotifier } from './inAppNotifier.js';
import type {
  NotificationPayload,
  NotificationResult,
  ClientNotificationPrefs,
} from './types.js';

const logger = createServiceLogger('notification:router');

/** Max alerts per client per hour. */
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Escalation timeout for HIGH impact alerts: 2 hours. */
const ESCALATION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NotificationRouterDeps {
  readonly prisma: PrismaClient;
  readonly emailNotifier: EmailNotifier;
  readonly teamsNotifier: TeamsNotifier;
  readonly inAppNotifier: InAppNotifier;
}

// ---------------------------------------------------------------------------
// NotificationRouter
// ---------------------------------------------------------------------------

export class NotificationRouter {
  private readonly deps: NotificationRouterDeps;
  private escalationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: NotificationRouterDeps) {
    this.deps = deps;
  }

  /**
   * Start the escalation check loop.
   * Checks every 10 minutes for HIGH alerts not acknowledged within 2 hours.
   */
  startEscalationLoop(): void {
    this.escalationTimer = setInterval(() => {
      void this.checkEscalations();
    }, 10 * 60 * 1000);

    logger.info({
      operation: 'router:escalation_loop_started',
      intervalMinutes: 10,
      result: 'success',
    });
  }

  stopEscalationLoop(): void {
    if (this.escalationTimer) {
      clearInterval(this.escalationTimer);
      this.escalationTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Main routing
  // -------------------------------------------------------------------------

  /**
   * Route an alert to the appropriate channel(s).
   *
   * 1. Load client notification preferences
   * 2. Check rate limit (max 3 per client per hour)
   * 3. Send to each configured channel
   * 4. Update alert status in PostgreSQL
   * 5. Log audit entry
   */
  async route(
    alert: Alert,
    subject: string,
    bodyHtml: string,
    bodyText: string,
  ): Promise<readonly NotificationResult[]> {
    const requestId = randomUUID();
    const startTime = Date.now();

    // --- Step 1: Load preferences ---
    const prefs = await this.loadClientPreferences(alert.clientId, alert.tenantId);

    // --- Step 2: Rate limit check ---
    const isRateLimited = await this.checkRateLimit(alert.clientId);
    if (isRateLimited) {
      logger.warn({
        operation: 'router:rate_limited',
        requestId,
        alertId: alert.id,
        clientId: alert.clientId,
        maxPerHour: RATE_LIMIT_MAX,
        result: 'rate_limited',
      });

      // Still persist the alert but don't send notification
      await this.deps.prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      return [{
        alertId: alert.id,
        channel: alert.channel,
        success: false,
        messageId: null,
        error: `Rate limited: max ${RATE_LIMIT_MAX} alerts per client per hour`,
        durationMs: Date.now() - startTime,
      }];
    }

    // --- Step 3: Send to each channel ---
    const payload: NotificationPayload = {
      alertId: alert.id,
      clientId: alert.clientId,
      tenantId: alert.tenantId,
      channel: alert.channel,
      impactLevel: alert.impactLevel,
      subject,
      bodyHtml,
      bodyText,
      recipientEmail: prefs.contactEmail,
      teamsWebhookUrl: prefs.teamsWebhookUrl,
    };

    const results: NotificationResult[] = [];

    for (const channel of prefs.channels) {
      const result = await this.sendToChannel(channel, payload);
      results.push(result);
    }

    // --- Step 4: Update alert status ---
    const anySent = results.some((r) => r.success);
    if (anySent) {
      await this.deps.prisma.$transaction([
        this.deps.prisma.alert.update({
          where: { id: alert.id },
          data: { status: 'SENT', sentAt: new Date() },
        }),
        this.deps.prisma.auditEntry.create({
          data: {
            id: randomUUID(),
            tenantId: alert.tenantId,
            action: 'ALERT_SENT',
            entityType: 'Alert',
            entityId: alert.id,
            performedBy: 'system:notification-router',
            details: {
              channels: prefs.channels,
              results: results.map((r) => ({
                channel: r.channel,
                success: r.success,
                error: r.error,
              })),
            },
          },
        }),
      ]);
    }

    logger.info({
      operation: 'router:route_complete',
      requestId,
      alertId: alert.id,
      clientId: alert.clientId,
      channels: prefs.channels,
      successCount: results.filter((r) => r.success).length,
      failCount: results.filter((r) => !r.success).length,
      duration: Date.now() - startTime,
      result: anySent ? 'success' : 'all_failed',
    });

    return results;
  }

  // -------------------------------------------------------------------------
  // Channel dispatch
  // -------------------------------------------------------------------------

  private async sendToChannel(
    channel: AlertChannel,
    payload: NotificationPayload,
  ): Promise<NotificationResult> {
    switch (channel) {
      case 'EMAIL':
        return this.deps.emailNotifier.send(payload);
      case 'TEAMS':
        return this.deps.teamsNotifier.send(payload);
      case 'SSE':
        return this.deps.inAppNotifier.send(payload);
    }
  }

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  /**
   * Check if a client has exceeded the rate limit.
   * Max 3 alerts per client per hour.
   */
  private async checkRateLimit(clientId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

    const recentCount = await this.deps.prisma.alert.count({
      where: {
        clientId,
        sentAt: { gte: cutoff },
        status: { in: ['SENT', 'ACKNOWLEDGED'] },
      },
    });

    return recentCount >= RATE_LIMIT_MAX;
  }

  // -------------------------------------------------------------------------
  // Client preferences
  // -------------------------------------------------------------------------

  /**
   * Load notification preferences for a client.
   * Falls back to defaults if no preferences are configured.
   */
  private async loadClientPreferences(
    clientId: string,
    tenantId: string,
  ): Promise<ClientNotificationPrefs> {
    const client = await this.deps.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        contactEmail: true,
        teamsWebhookUrl: true,
        escalationEmail: true,
        notificationChannels: true,
      },
    });

    if (!client) {
      return {
        clientId,
        channels: ['SSE'],
        contactEmail: '',
        teamsWebhookUrl: null,
        escalationEmail: null,
        maxAlertsPerHour: RATE_LIMIT_MAX,
      };
    }

    // Parse channels from stored preferences or use defaults
    const channels = parseChannels(client.notificationChannels) ?? ['EMAIL', 'SSE'];

    return {
      clientId,
      channels,
      contactEmail: client.contactEmail ?? '',
      teamsWebhookUrl: client.teamsWebhookUrl ?? null,
      escalationEmail: client.escalationEmail ?? null,
      maxAlertsPerHour: RATE_LIMIT_MAX,
    };
  }

  // -------------------------------------------------------------------------
  // Escalation
  // -------------------------------------------------------------------------

  /**
   * Check for HIGH impact alerts that have not been acknowledged
   * within the escalation timeout (2 hours).
   * Sends escalation email to the manager.
   */
  private async checkEscalations(): Promise<void> {
    const cutoff = new Date(Date.now() - ESCALATION_TIMEOUT_MS);

    const unacknowledged = await this.deps.prisma.alert.findMany({
      where: {
        impactLevel: 'HIGH',
        status: 'SENT',
        sentAt: { lte: cutoff },
        acknowledgedAt: null,
      },
      include: {
        client: {
          select: {
            name: true,
            escalationEmail: true,
            tenantId: true,
          },
        },
      },
      take: 50,
    });

    if (unacknowledged.length === 0) return;

    logger.warn({
      operation: 'router:escalation_check',
      unacknowledgedCount: unacknowledged.length,
      result: 'escalating',
    });

    for (const alert of unacknowledged) {
      const escalationEmail = alert.client?.escalationEmail;
      if (!escalationEmail) continue;

      const payload: NotificationPayload = {
        alertId: alert.id,
        clientId: alert.clientId,
        tenantId: alert.tenantId,
        channel: 'EMAIL',
        impactLevel: 'HIGH',
        subject: `[ESCALACIÓN] Alerta HIGH no confirmada: ${alert.id.slice(0, 8)}`,
        bodyHtml: buildEscalationHtml(alert, alert.client?.name ?? 'Unknown'),
        bodyText: `ESCALACIÓN: Alerta HIGH ${alert.id} para ${alert.client?.name ?? 'Unknown'} sin confirmar después de 2 horas. Acción inmediata requerida.`,
        recipientEmail: escalationEmail,
        teamsWebhookUrl: null,
      };

      await this.deps.emailNotifier.send(payload);

      // Mark as escalated to avoid re-sending
      await this.deps.prisma.alert.update({
        where: { id: alert.id },
        data: {
          status: 'SENT', // Keep as SENT but add escalation audit
        },
      });

      await this.deps.prisma.auditEntry.create({
        data: {
          id: randomUUID(),
          tenantId: alert.tenantId,
          action: 'ALERT_SENT',
          entityType: 'Alert',
          entityId: alert.id,
          performedBy: 'system:escalation',
          details: {
            escalatedTo: '***',
            reason: 'HIGH impact alert not acknowledged within 2 hours',
            originalSentAt: alert.sentAt?.toISOString(),
          },
        },
      });
    }

    logger.info({
      operation: 'router:escalation_complete',
      escalatedCount: unacknowledged.length,
      result: 'success',
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseChannels(value: unknown): AlertChannel[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const valid: AlertChannel[] = [];
    for (const v of value) {
      if (v === 'EMAIL' || v === 'TEAMS' || v === 'SSE') {
        valid.push(v);
      }
    }
    return valid.length > 0 ? valid : null;
  }
  return null;
}

function buildEscalationHtml(alert: { id: string; message: string }, clientName: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; padding: 20px;">
  <div style="border-left: 4px solid #dc2626; padding-left: 16px;">
    <h2 style="color: #dc2626;">ESCALACIÓN — Alerta no confirmada</h2>
    <p>La siguiente alerta HIGH no fue confirmada dentro del período de 2 horas:</p>
    <ul>
      <li><strong>Cliente:</strong> ${clientName}</li>
      <li><strong>Alert ID:</strong> ${alert.id}</li>
      <li><strong>Mensaje:</strong> ${alert.message.slice(0, 300)}</li>
    </ul>
    <p><strong>Acción requerida:</strong> Revisar y confirmar la alerta inmediatamente en el dashboard de RegWatch AI.</p>
  </div>
  <hr>
  <p style="font-size: 12px; color: #999;">RegWatch AI — Sistema de escalamiento automático</p>
</body></html>`;
}
