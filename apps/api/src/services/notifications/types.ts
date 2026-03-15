// ============================================================================
// FILE: apps/api/src/services/notifications/types.ts
// Types for the notification subsystem.
// ============================================================================

import type { AlertChannel, ImpactLevel } from '@regwatch/shared';

/** Payload sent through any notification channel. */
export interface NotificationPayload {
  readonly alertId: string;
  readonly clientId: string;
  readonly tenantId: string;
  readonly channel: AlertChannel;
  readonly impactLevel: ImpactLevel;
  readonly subject: string;
  readonly bodyHtml: string;
  readonly bodyText: string;
  readonly recipientEmail: string | null;
  readonly teamsWebhookUrl: string | null;
}

/** Result of a notification delivery attempt. */
export interface NotificationResult {
  readonly alertId: string;
  readonly channel: AlertChannel;
  readonly success: boolean;
  readonly messageId: string | null;
  readonly error: string | null;
  readonly durationMs: number;
}

/** Client notification preferences stored in PostgreSQL. */
export interface ClientNotificationPrefs {
  readonly clientId: string;
  readonly channels: readonly AlertChannel[];
  readonly contactEmail: string;
  readonly teamsWebhookUrl: string | null;
  readonly escalationEmail: string | null;
  readonly maxAlertsPerHour: number;
}

/** Notification channel adapter interface. */
export interface NotificationChannel {
  readonly name: AlertChannel;
  send(payload: NotificationPayload): Promise<NotificationResult>;
}
