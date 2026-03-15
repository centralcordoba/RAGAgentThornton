// ============================================================================
// FILE: apps/api/src/services/alerts/alertEngine.ts
// Alert Engine — processes regulatory changes into client alerts.
//
// Flow:
//   1. findAffectedClients from ComplianceGraph
//   2. Per client: RAG analysis → urgency score → personalized message
//   3. Deduplicate (no duplicate alert within 24h)
//   4. Persist in PostgreSQL
//   5. Route: HIGH → HITL queue, MEDIUM/LOW → notification queue
// ============================================================================

import { randomUUID } from 'node:crypto';
import { ServiceBusClient, type ServiceBusSender } from '@azure/service-bus';
import type { PrismaClient } from '@prisma/client';
import type {
  Alert,
  AlertStatus,
  AlertChannel,
  RegulatoryChange,
  Client,
  ImpactLevel,
  AlertReviewMessage,
} from '@regwatch/shared';
import type { RegulatoryRAG } from '@regwatch/ai-core';
import { createServiceLogger } from '../../config/logger.js';
import type { ComplianceGraphService } from '../../graph/complianceGraph.js';
import { AlertFormatter } from './alertFormatter.js';
import type { AlertMessage } from './alertFormatter.js';

const logger = createServiceLogger('service:alert-engine');

/** Deduplication window: 24 hours. */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AlertEngineConfig {
  readonly serviceBusConnectionString: string;
  readonly alertReviewQueueName: string;
  readonly notificationQueueName: string;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface AlertEngineDeps {
  readonly prisma: PrismaClient;
  readonly graphService: ComplianceGraphService;
  readonly ragEngine: RegulatoryRAG;
}

// ---------------------------------------------------------------------------
// AlertEngine
// ---------------------------------------------------------------------------

export class AlertEngine {
  private readonly config: AlertEngineConfig;
  private readonly deps: AlertEngineDeps;
  private readonly formatter: AlertFormatter;
  private serviceBusClient: ServiceBusClient | null = null;
  private reviewSender: ServiceBusSender | null = null;
  private notificationSender: ServiceBusSender | null = null;

  constructor(config: AlertEngineConfig, deps: AlertEngineDeps) {
    this.config = config;
    this.deps = deps;
    this.formatter = new AlertFormatter();
  }

  /** Initialize Service Bus senders. */
  async initialize(): Promise<void> {
    if (this.config.serviceBusConnectionString) {
      this.serviceBusClient = new ServiceBusClient(this.config.serviceBusConnectionString);
      this.reviewSender = this.serviceBusClient.createSender(this.config.alertReviewQueueName);
      this.notificationSender = this.serviceBusClient.createSender(this.config.notificationQueueName);
    }
  }

  /** Shut down Service Bus connections. */
  async dispose(): Promise<void> {
    await this.reviewSender?.close();
    await this.notificationSender?.close();
    await this.serviceBusClient?.close();
  }

  // -------------------------------------------------------------------------
  // Main processing
  // -------------------------------------------------------------------------

  /**
   * Process a regulatory change into alerts for all affected clients.
   *
   * 1. Find affected clients via ComplianceGraph
   * 2. Per client: generate analysis, calculate urgency, format message
   * 3. Deduplicate (skip if same client+change alerted in last 24h)
   * 4. Persist in PostgreSQL + audit trail
   * 5. Route to HITL queue (HIGH) or notification queue (MEDIUM/LOW)
   */
  async process(change: RegulatoryChange): Promise<readonly Alert[]> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const alerts: Alert[] = [];

    logger.info({
      operation: 'alert_engine:process_start',
      requestId,
      changeId: change.id,
      country: change.country,
      impactLevel: change.impactLevel,
    });

    // --- Step 1: Find affected clients ---
    const affectedClients = await this.deps.graphService.findAffectedClients(change);

    logger.info({
      operation: 'alert_engine:affected_clients',
      requestId,
      changeId: change.id,
      affectedCount: affectedClients.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    if (affectedClients.length === 0) {
      logger.info({
        operation: 'alert_engine:no_affected_clients',
        requestId,
        changeId: change.id,
        result: 'skipped',
      });
      return [];
    }

    // --- Step 2-5: Process per client ---
    for (const affectedClient of affectedClients) {
      try {
        const alert = await this.processForClient(
          change,
          affectedClient,
          requestId,
        );
        if (alert) {
          alerts.push(alert);
        }
      } catch (err) {
        logger.error({
          operation: 'alert_engine:client_processing_failed',
          requestId,
          changeId: change.id,
          clientId: affectedClient.clientId,
          result: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info({
      operation: 'alert_engine:process_complete',
      requestId,
      changeId: change.id,
      totalAffected: affectedClients.length,
      alertsCreated: alerts.length,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return alerts;
  }

  // -------------------------------------------------------------------------
  // Per-client processing
  // -------------------------------------------------------------------------

  private async processForClient(
    change: RegulatoryChange,
    affectedClient: { clientId: string; clientName: string; tenantId: string; matchedObligations: readonly string[] },
    requestId: string,
  ): Promise<Alert | null> {
    const startTime = Date.now();

    // --- Step 3: Deduplicate ---
    const isDuplicate = await this.checkDuplicate(
      affectedClient.clientId,
      change.id,
    );

    if (isDuplicate) {
      logger.debug({
        operation: 'alert_engine:dedup_skip',
        requestId,
        clientId: affectedClient.clientId,
        changeId: change.id,
        result: 'skipped',
      });
      return null;
    }

    // --- Step 2: Generate analysis + format message ---
    // Fetch full client record for analysis
    const client = await this.deps.prisma.client.findUnique({
      where: { id: affectedClient.clientId },
    });

    if (!client) {
      logger.warn({
        operation: 'alert_engine:client_not_found',
        requestId,
        clientId: affectedClient.clientId,
        result: 'skipped',
      });
      return null;
    }

    const clientData: Client = {
      id: client.id,
      tenantId: client.tenantId,
      name: client.name,
      countries: client.countries,
      companyType: client.companyType,
      industries: client.industries,
      contactEmail: client.contactEmail,
      isActive: client.isActive,
      onboardedAt: client.onboardedAt,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };

    // Generate AI analysis
    const analysis = await this.deps.ragEngine.generateAnalysis(
      change,
      clientData,
      affectedClient.matchedObligations,
    );

    // Skip if insufficient confidence
    if (analysis.answer === 'insufficient data') {
      logger.info({
        operation: 'alert_engine:insufficient_confidence',
        requestId,
        clientId: affectedClient.clientId,
        changeId: change.id,
        confidence: analysis.confidence,
        result: 'skipped',
      });
      return null;
    }

    // Format alert message
    const alertMessage = this.formatter.format(analysis, change, clientData);

    // Calculate urgency-based channel preference
    const channel = determineChannel(change.impactLevel);

    // Determine initial status based on impact level
    // HIGH → PENDING_REVIEW (HITL required)
    // MEDIUM/LOW → direct to APPROVED
    const status: AlertStatus = change.impactLevel === 'HIGH'
      ? 'PENDING_REVIEW'
      : 'APPROVED';

    // --- Step 4: Persist in PostgreSQL ---
    const alertId = randomUUID();
    const now = new Date();

    const alert: Alert = {
      id: alertId,
      clientId: clientData.id,
      tenantId: clientData.tenantId,
      changeId: change.id,
      obligationId: null,
      message: alertMessage.bodyText,
      channel,
      status,
      impactLevel: change.impactLevel,
      reviewedBy: null,
      reviewedAt: null,
      sentAt: status === 'APPROVED' ? now : null,
      acknowledgedAt: null,
      createdAt: now,
    };

    await this.deps.prisma.$transaction([
      this.deps.prisma.alert.create({
        data: {
          id: alert.id,
          clientId: alert.clientId,
          tenantId: alert.tenantId,
          changeId: alert.changeId,
          obligationId: alert.obligationId,
          message: alert.message,
          channel: alert.channel,
          status: alert.status,
          impactLevel: alert.impactLevel,
          reviewedBy: alert.reviewedBy,
          reviewedAt: alert.reviewedAt,
          sentAt: alert.sentAt,
          acknowledgedAt: alert.acknowledgedAt,
        },
      }),
      this.deps.prisma.auditEntry.create({
        data: {
          id: randomUUID(),
          tenantId: alert.tenantId,
          action: 'ALERT_CREATED',
          entityType: 'Alert',
          entityId: alert.id,
          performedBy: 'system:alert-engine',
          details: {
            changeId: change.id,
            clientId: clientData.id,
            impactLevel: change.impactLevel,
            status: alert.status,
            confidence: analysis.confidence,
          },
        },
      }),
    ]);

    // --- Step 5: Route to appropriate queue ---
    await this.routeAlert(alert, alertMessage, requestId);

    logger.info({
      operation: 'alert_engine:alert_created',
      requestId,
      alertId: alert.id,
      clientId: clientData.id,
      changeId: change.id,
      impactLevel: change.impactLevel,
      status: alert.status,
      channel: alert.channel,
      confidence: analysis.confidence,
      duration: Date.now() - startTime,
      result: 'success',
    });

    return alert;
  }

  // -------------------------------------------------------------------------
  // Routing: HITL vs direct notification
  // -------------------------------------------------------------------------

  /**
   * Route alert based on impact level:
   * - HIGH → alert-review queue (HITL: GT Professional must approve)
   * - MEDIUM/LOW → notification queue (direct delivery)
   */
  private async routeAlert(
    alert: Alert,
    message: AlertMessage,
    requestId: string,
  ): Promise<void> {
    if (alert.impactLevel === 'HIGH') {
      // HITL: enqueue for GT Professional review
      if (this.reviewSender) {
        const reviewMessage: AlertReviewMessage = {
          alertId: alert.id,
          clientId: alert.clientId,
          tenantId: alert.tenantId,
          changeId: alert.changeId,
          impactLevel: alert.impactLevel,
          message: message.subject,
          createdAt: alert.createdAt,
        };

        await this.reviewSender.sendMessages({
          body: reviewMessage,
          contentType: 'application/json',
          messageId: `review:${alert.id}`,
          subject: 'HIGH',
          applicationProperties: {
            alertId: alert.id,
            tenantId: alert.tenantId,
            impactLevel: 'HIGH',
          },
        });

        logger.info({
          operation: 'alert_engine:routed_to_hitl',
          requestId,
          alertId: alert.id,
          queue: this.config.alertReviewQueueName,
          result: 'success',
        });
      }
    } else {
      // Direct delivery: enqueue for notification
      if (this.notificationSender) {
        await this.notificationSender.sendMessages({
          body: {
            alertId: alert.id,
            clientId: alert.clientId,
            tenantId: alert.tenantId,
            channel: alert.channel,
            impactLevel: alert.impactLevel,
            subject: message.subject,
            bodyHtml: message.bodyHtml,
            bodyText: message.bodyText,
          },
          contentType: 'application/json',
          messageId: `notify:${alert.id}`,
          subject: alert.impactLevel,
          applicationProperties: {
            alertId: alert.id,
            tenantId: alert.tenantId,
            channel: alert.channel,
          },
        });

        logger.info({
          operation: 'alert_engine:routed_to_notification',
          requestId,
          alertId: alert.id,
          channel: alert.channel,
          queue: this.config.notificationQueueName,
          result: 'success',
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  /**
   * Check if an alert was already sent for this client + change within 24h.
   */
  private async checkDuplicate(clientId: string, changeId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);

    const existing = await this.deps.prisma.alert.findFirst({
      where: {
        clientId,
        changeId,
        createdAt: { gte: cutoff },
      },
      select: { id: true },
    });

    return existing !== null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function determineChannel(impactLevel: ImpactLevel): AlertChannel {
  switch (impactLevel) {
    case 'HIGH':
      return 'EMAIL';   // HIGH always goes via email after HITL approval
    case 'MEDIUM':
      return 'TEAMS';   // MEDIUM via Teams adaptive card
    case 'LOW':
      return 'SSE';     // LOW via in-app notification only
  }
}
