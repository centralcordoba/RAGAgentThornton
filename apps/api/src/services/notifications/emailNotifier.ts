// ============================================================================
// FILE: apps/api/src/services/notifications/emailNotifier.ts
// Email notification channel via Azure Communication Services.
// ============================================================================

import { EmailClient } from '@azure/communication-email';
import { createServiceLogger } from '../../config/logger.js';
import type { NotificationChannel, NotificationPayload, NotificationResult } from './types.js';

const logger = createServiceLogger('notification:email');

export interface EmailNotifierConfig {
  readonly acsConnectionString: string;
  readonly senderEmail: string;
}

export class EmailNotifier implements NotificationChannel {
  readonly name = 'EMAIL' as const;
  private readonly client: EmailClient;
  private readonly senderEmail: string;

  constructor(config: EmailNotifierConfig) {
    this.client = new EmailClient(config.acsConnectionString);
    this.senderEmail = config.senderEmail;
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const startTime = Date.now();

    if (!payload.recipientEmail) {
      return {
        alertId: payload.alertId,
        channel: 'EMAIL',
        success: false,
        messageId: null,
        error: 'No recipient email provided',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const poller = await this.client.beginSend({
        senderAddress: this.senderEmail,
        content: {
          subject: payload.subject,
          html: payload.bodyHtml,
          plainText: payload.bodyText,
        },
        recipients: {
          to: [{ address: payload.recipientEmail }],
        },
      });

      const result = await poller.pollUntilDone();
      const duration = Date.now() - startTime;

      logger.info({
        operation: 'email:send',
        alertId: payload.alertId,
        recipientEmail: '***',
        messageId: result.id,
        status: result.status,
        duration,
        result: 'success',
      });

      return {
        alertId: payload.alertId,
        channel: 'EMAIL',
        success: result.status === 'Succeeded',
        messageId: result.id,
        error: result.status !== 'Succeeded' ? `Email status: ${result.status}` : null,
        durationMs: duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;

      logger.error({
        operation: 'email:send',
        alertId: payload.alertId,
        duration,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        alertId: payload.alertId,
        channel: 'EMAIL',
        success: false,
        messageId: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: duration,
      };
    }
  }
}
