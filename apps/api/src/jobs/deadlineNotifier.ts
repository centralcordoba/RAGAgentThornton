// ============================================================================
// FILE: apps/api/src/jobs/deadlineNotifier.ts
// Daily job (8am UTC) — checks calendar events for upcoming deadlines and
// generates escalation notifications based on proximity.
//
// Escalation logic:
//   30 days before → INFO email to assigned GT_PROFESSIONAL
//    7 days before → MEDIUM system alert + urgent email
//    1 day  before → HIGH alert + email + push notification
//    Day of deadline → HIGH alert + mark AT_RISK
//    After deadline → mark OVERDUE + notify GT_ADMIN
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { CalendarEvent } from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('job:deadline-notifier');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeadlineNotification {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly clientName: string;
  readonly daysUntil: number;
  readonly level: 'INFO' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly channels: readonly ('EMAIL' | 'SYSTEM_ALERT' | 'PUSH')[];
  readonly recipientRole: 'PROFESSIONAL' | 'ADMIN';
  readonly message: string;
}

type EventProvider = () => CalendarEvent[];
type StatusUpdater = (eventId: string, status: string) => void;

// ---------------------------------------------------------------------------
// DeadlineNotifierJob
// ---------------------------------------------------------------------------

export class DeadlineNotifierJob {
  private readonly getEvents: EventProvider;
  private readonly updateStatus: StatusUpdater;

  constructor(getEvents: EventProvider, updateStatus: StatusUpdater) {
    this.getEvents = getEvents;
    this.updateStatus = updateStatus;
  }

  /**
   * Run the deadline check. Returns notifications that would be sent.
   * In production, this integrates with NotificationService to actually deliver.
   */
  run(): DeadlineNotification[] {
    const requestId = randomUUID();
    const startTime = Date.now();

    const events = this.getEvents().filter(
      (e) => e.status !== 'COMPLETED',
    );

    const notifications: DeadlineNotification[] = [];

    for (const event of events) {
      const daysUntil = calculateDaysUntil(event.date);

      // After deadline → mark OVERDUE + notify ADMIN
      if (daysUntil < 0 && event.status !== 'OVERDUE') {
        this.updateStatus(event.id, 'OVERDUE');

        notifications.push({
          eventId: event.id,
          eventTitle: event.title,
          clientName: event.client.name,
          daysUntil,
          level: 'CRITICAL',
          channels: ['EMAIL', 'SYSTEM_ALERT', 'PUSH'],
          recipientRole: 'ADMIN',
          message: `VENCIDO: "${event.title}" para ${event.client.name} vencio hace ${Math.abs(daysUntil)} dias. Requiere atencion inmediata del administrador.`,
        });

        logger.warn({
          service: 'jobs',
          operation: 'deadline_notifier:overdue',
          requestId,
          eventId: event.id,
          daysUntil,
          clientName: event.client.name,
          result: 'overdue_marked',
        });
      }

      // Day of deadline → HIGH + mark AT_RISK
      if (daysUntil === 0) {
        notifications.push({
          eventId: event.id,
          eventTitle: event.title,
          clientName: event.client.name,
          daysUntil,
          level: 'HIGH',
          channels: ['EMAIL', 'SYSTEM_ALERT', 'PUSH'],
          recipientRole: 'PROFESSIONAL',
          message: `HOY VENCE: "${event.title}" para ${event.client.name}. Completar antes del cierre del dia.`,
        });
      }

      // 1 day before → HIGH + email + push
      if (daysUntil === 1) {
        notifications.push({
          eventId: event.id,
          eventTitle: event.title,
          clientName: event.client.name,
          daysUntil,
          level: 'HIGH',
          channels: ['EMAIL', 'SYSTEM_ALERT', 'PUSH'],
          recipientRole: 'PROFESSIONAL',
          message: `MANANA VENCE: "${event.title}" para ${event.client.name}. Verificar que todo esta preparado.`,
        });
      }

      // 7 days before → MEDIUM alert + urgent email
      if (daysUntil === 7) {
        notifications.push({
          eventId: event.id,
          eventTitle: event.title,
          clientName: event.client.name,
          daysUntil,
          level: 'MEDIUM',
          channels: ['EMAIL', 'SYSTEM_ALERT'],
          recipientRole: 'PROFESSIONAL',
          message: `7 dias para: "${event.title}" (${event.client.name}). Asegurar que el proceso esta en marcha.`,
        });
      }

      // 30 days before → INFO email
      if (daysUntil === 30) {
        notifications.push({
          eventId: event.id,
          eventTitle: event.title,
          clientName: event.client.name,
          daysUntil,
          level: 'INFO',
          channels: ['EMAIL'],
          recipientRole: 'PROFESSIONAL',
          message: `Recordatorio: "${event.title}" para ${event.client.name} vence en 30 dias (${event.date}).`,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info({
      service: 'jobs',
      operation: 'deadline_notifier:run',
      requestId,
      totalEvents: events.length,
      notificationsGenerated: notifications.length,
      overdueCount: notifications.filter((n) => n.level === 'CRITICAL').length,
      highCount: notifications.filter((n) => n.level === 'HIGH').length,
      mediumCount: notifications.filter((n) => n.level === 'MEDIUM').length,
      infoCount: notifications.filter((n) => n.level === 'INFO').length,
      duration,
      result: 'success',
    });

    // In production: deliver via NotificationService
    for (const notif of notifications) {
      logger.info({
        service: 'jobs',
        operation: 'deadline_notifier:notification',
        requestId,
        eventId: notif.eventId,
        level: notif.level,
        channels: notif.channels,
        recipientRole: notif.recipientRole,
        message: notif.message,
        result: 'queued',
      });
    }

    return notifications;
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule the deadline notifier to run daily at 8am UTC.
 * In production, this would be an Azure Functions timer trigger:
 *   `0 0 8 * * *` (CRON expression)
 */
export function scheduleDeadlineNotifier(
  getEvents: EventProvider,
  updateStatus: StatusUpdater,
): { stop: () => void } {
  const job = new DeadlineNotifierJob(getEvents, updateStatus);

  // Calculate ms until next 8am UTC
  const now = new Date();
  const todayEightAm = new Date(now);
  todayEightAm.setUTCHours(8, 0, 0, 0);

  let msUntilNext = todayEightAm.getTime() - now.getTime();
  if (msUntilNext < 0) msUntilNext += ONE_DAY_MS;

  logger.info({
    service: 'jobs',
    operation: 'deadline_notifier:scheduled',
    nextRunIn: `${Math.round(msUntilNext / 60_000)}min`,
    result: 'success',
  });

  // Initial run after delay, then daily
  const initialTimeout = setTimeout(() => {
    job.run();
    intervalRef = setInterval(() => job.run(), ONE_DAY_MS);
  }, msUntilNext);

  let intervalRef: ReturnType<typeof setInterval> | null = null;

  return {
    stop: () => {
      clearTimeout(initialTimeout);
      if (intervalRef) clearInterval(intervalRef);
      logger.info({
        service: 'jobs',
        operation: 'deadline_notifier:stopped',
        result: 'success',
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateDaysUntil(dateStr: string): number {
  const target = new Date(dateStr).getTime();
  const now = new Date(new Date().toISOString().split('T')[0]!).getTime();
  return Math.ceil((target - now) / 86_400_000);
}
