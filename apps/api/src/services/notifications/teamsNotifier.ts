// ============================================================================
// FILE: apps/api/src/services/notifications/teamsNotifier.ts
// Microsoft Teams notification channel via incoming webhooks (Adaptive Cards).
// ============================================================================

import { createServiceLogger } from '../../config/logger.js';
import type { NotificationChannel, NotificationPayload, NotificationResult } from './types.js';
import type { ImpactLevel } from '@regwatch/shared';

const logger = createServiceLogger('notification:teams');

export class TeamsNotifier implements NotificationChannel {
  readonly name = 'TEAMS' as const;

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const startTime = Date.now();

    if (!payload.teamsWebhookUrl) {
      return {
        alertId: payload.alertId,
        channel: 'TEAMS',
        success: false,
        messageId: null,
        error: 'No Teams webhook URL configured',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const adaptiveCard = buildAdaptiveCard(payload);

      const response = await fetch(payload.teamsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adaptiveCard),
        signal: AbortSignal.timeout(15_000),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');

        logger.error({
          operation: 'teams:send',
          alertId: payload.alertId,
          statusCode: response.status,
          duration,
          result: 'error',
          error: errorBody,
        });

        return {
          alertId: payload.alertId,
          channel: 'TEAMS',
          success: false,
          messageId: null,
          error: `Teams webhook returned HTTP ${response.status}`,
          durationMs: duration,
        };
      }

      logger.info({
        operation: 'teams:send',
        alertId: payload.alertId,
        duration,
        result: 'success',
      });

      return {
        alertId: payload.alertId,
        channel: 'TEAMS',
        success: true,
        messageId: payload.alertId,
        error: null,
        durationMs: duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;

      logger.error({
        operation: 'teams:send',
        alertId: payload.alertId,
        duration,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        alertId: payload.alertId,
        channel: 'TEAMS',
        success: false,
        messageId: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: duration,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Adaptive Card builder
// ---------------------------------------------------------------------------

function buildAdaptiveCard(payload: NotificationPayload): TeamsCardEnvelope {
  const severityColor = getSeverityColor(payload.impactLevel);
  const severityEmoji = getSeverityEmoji(payload.impactLevel);

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'ColumnSet',
              columns: [
                {
                  type: 'Column',
                  width: 'auto',
                  items: [
                    {
                      type: 'TextBlock',
                      text: severityEmoji,
                      size: 'ExtraLarge',
                    },
                  ],
                },
                {
                  type: 'Column',
                  width: 'stretch',
                  items: [
                    {
                      type: 'TextBlock',
                      text: payload.subject,
                      weight: 'Bolder',
                      size: 'Medium',
                      wrap: true,
                      color: severityColor,
                    },
                    {
                      type: 'TextBlock',
                      text: `Impacto: **${payload.impactLevel}** · Alert ID: ${payload.alertId.slice(0, 8)}`,
                      spacing: 'None',
                      isSubtle: true,
                      size: 'Small',
                    },
                  ],
                },
              ],
            },
            {
              type: 'TextBlock',
              text: truncateText(payload.bodyText, 500),
              wrap: true,
              spacing: 'Medium',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Cliente', value: payload.clientId.slice(0, 8) + '...' },
                { title: 'Canal', value: payload.channel },
                { title: 'Impacto', value: payload.impactLevel },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Ver en RegWatch AI',
              url: `https://regwatch.grantthornton.com/alerts/${payload.alertId}`,
            },
            {
              type: 'Action.OpenUrl',
              title: 'Confirmar recepción',
              url: `https://regwatch.grantthornton.com/alerts/${payload.alertId}/ack`,
            },
          ],
        },
      },
    ],
  };
}

function getSeverityColor(level: ImpactLevel): string {
  const colors: Record<ImpactLevel, string> = {
    HIGH: 'Attention',
    MEDIUM: 'Warning',
    LOW: 'Good',
  };
  return colors[level];
}

function getSeverityEmoji(level: ImpactLevel): string {
  const emojis: Record<ImpactLevel, string> = {
    HIGH: '🔴',
    MEDIUM: '🟡',
    LOW: '🟢',
  };
  return emojis[level];
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// ---------------------------------------------------------------------------
// Teams webhook types
// ---------------------------------------------------------------------------

interface TeamsCardEnvelope {
  readonly type: string;
  readonly attachments: readonly TeamsAttachment[];
}

interface TeamsAttachment {
  readonly contentType: string;
  readonly contentUrl: null;
  readonly content: AdaptiveCard;
}

interface AdaptiveCard {
  readonly $schema: string;
  readonly type: string;
  readonly version: string;
  readonly body: readonly Record<string, unknown>[];
  readonly actions: readonly Record<string, unknown>[];
}
