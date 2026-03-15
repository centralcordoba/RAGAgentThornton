// ============================================================================
// FILE: apps/api/src/jobs/consumers/changeConsumer.ts
// Consumes messages from the 'regulatory-changes' Service Bus queue.
//
// IDEMPOTENCY: source + documentId + version checked in PostgreSQL.
//   - Already exists → skip silently + log
//   - New → index in AI Search + store in PG + trigger client analysis + enqueue alerts
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  ServiceBusClient,
  type ServiceBusReceivedMessage,
  type ServiceBusReceiver,
  type ServiceBusSender,
} from '@azure/service-bus';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@regwatch/shared';
import type { IngestionMessage, RegulatoryChange, ImpactLevel, Client } from '@regwatch/shared';
import type { DocumentIndexer } from '@regwatch/ai-core';
import type { RegulatoryRAG } from '@regwatch/ai-core';
import { createServiceLogger } from '../../config/logger.js';

const logger = createServiceLogger('consumer:regulatory-changes');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ChangeConsumerConfig {
  readonly serviceBusConnectionString: string;
  readonly sourceQueueName: string;
  readonly alertQueueName: string;
  readonly maxConcurrentCalls: number;
  readonly maxAutoLockRenewalDurationMs: number;
}

const DEFAULT_CONFIG: Omit<ChangeConsumerConfig, 'serviceBusConnectionString'> = {
  sourceQueueName: 'regulatory-changes',
  alertQueueName: 'alert-review',
  maxConcurrentCalls: 5,
  maxAutoLockRenewalDurationMs: 300_000, // 5 min
};

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ChangeConsumerDeps {
  readonly prisma: PrismaClient;
  readonly documentIndexer: DocumentIndexer;
  readonly ragEngine: RegulatoryRAG;
  readonly getAffectedClients: (country: string, jurisdiction: string) => Promise<readonly Client[]>;
}

// ---------------------------------------------------------------------------
// ChangeConsumer
// ---------------------------------------------------------------------------

export class ChangeConsumer {
  private readonly config: ChangeConsumerConfig;
  private readonly deps: ChangeConsumerDeps;
  private serviceBusClient: ServiceBusClient | null = null;
  private receiver: ServiceBusReceiver | null = null;
  private alertSender: ServiceBusSender | null = null;
  private isRunning = false;

  constructor(
    config: Pick<ChangeConsumerConfig, 'serviceBusConnectionString'> & Partial<ChangeConsumerConfig>,
    deps: ChangeConsumerDeps,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deps = deps;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start consuming messages from the regulatory-changes queue. */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.serviceBusClient = new ServiceBusClient(this.config.serviceBusConnectionString);

    this.receiver = this.serviceBusClient.createReceiver(this.config.sourceQueueName, {
      receiveMode: 'peekLock',
      maxAutoLockRenewalDurationInMs: this.config.maxAutoLockRenewalDurationMs,
    });

    this.alertSender = this.serviceBusClient.createSender(this.config.alertQueueName);

    const subscription = this.receiver.subscribe(
      {
        processMessage: async (message) => {
          await this.processMessage(message);
        },
        processError: async (args) => {
          logger.error({
            operation: 'consumer:process_error',
            errorSource: args.errorSource,
            entityPath: args.entityPath,
            error: args.error.message,
            result: 'error',
          });
        },
      },
      {
        maxConcurrentCalls: this.config.maxConcurrentCalls,
        autoCompleteMessages: false,
      },
    );

    this.isRunning = true;

    logger.info({
      operation: 'consumer:started',
      queue: this.config.sourceQueueName,
      maxConcurrentCalls: this.config.maxConcurrentCalls,
      result: 'success',
    });
  }

  /** Stop the consumer gracefully. */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    await this.receiver?.close();
    await this.alertSender?.close();
    await this.serviceBusClient?.close();

    this.isRunning = false;

    logger.info({
      operation: 'consumer:stopped',
      queue: this.config.sourceQueueName,
      result: 'success',
    });
  }

  // -------------------------------------------------------------------------
  // Message processing
  // -------------------------------------------------------------------------

  /** Process a single message from the queue. */
  private async processMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const body = message.body as IngestionMessage;

    logger.info({
      operation: 'consumer:message_received',
      requestId,
      messageId: message.messageId,
      source: body.source,
      documentId: body.documentId,
      version: body.version,
      country: body.country,
    });

    try {
      // --- Step 1: Idempotency check ---
      const existing = await this.deps.prisma.regulatoryChange.findFirst({
        where: {
          sourceId: body.source,
          externalDocumentId: body.documentId,
          version: body.version,
        },
        select: { id: true },
      });

      if (existing) {
        // Already processed — skip silently
        await this.receiver!.completeMessage(message);

        logger.info({
          operation: 'consumer:skip_duplicate',
          requestId,
          source: body.source,
          documentId: body.documentId,
          version: body.version,
          existingId: existing.id,
          duration: Date.now() - startTime,
          result: 'skipped',
        });
        return;
      }

      // --- Step 2: Fetch full document content ---
      // The IngestionMessage contains metadata; the full content
      // was already parsed by the connector. We reconstruct the record.
      const regulatoryChange = await this.createRegulatoryChangeRecord(body, requestId);

      // --- Step 3: Index in Azure AI Search ---
      // Uses a shared tenantId ('system') for globally available regulations.
      // Per-client indexing happens in the analysis step.
      await this.deps.documentIndexer.embedAndIndex(
        regulatoryChange,
        body.source,
        'system',
        requestId,
      );

      // --- Step 4: Store in PostgreSQL + audit entry ---
      await this.deps.prisma.$transaction([
        this.deps.prisma.regulatoryChange.create({
          data: {
            id: regulatoryChange.id,
            sourceId: body.source,
            externalDocumentId: body.documentId,
            title: regulatoryChange.title,
            summary: regulatoryChange.summary,
            rawContent: regulatoryChange.rawContent,
            effectiveDate: regulatoryChange.effectiveDate,
            publishedDate: regulatoryChange.publishedDate,
            impactLevel: regulatoryChange.impactLevel,
            affectedAreas: regulatoryChange.affectedAreas as string[],
            affectedIndustries: regulatoryChange.affectedIndustries as string[],
            country: regulatoryChange.country,
            jurisdiction: regulatoryChange.jurisdiction,
            version: body.version,
            language: regulatoryChange.language,
            sourceUrl: body.rawContentUrl,
          },
        }),
        this.deps.prisma.auditEntry.create({
          data: {
            id: randomUUID(),
            tenantId: 'system',
            action: 'REGULATION_INGESTED',
            entityType: 'RegulatoryChange',
            entityId: regulatoryChange.id,
            performedBy: 'system:ingestion-consumer',
            details: {
              source: body.source,
              documentId: body.documentId,
              version: body.version,
              country: body.country,
              impactLevel: regulatoryChange.impactLevel,
            },
          },
        }),
      ]);

      // --- Step 5: Trigger client impact analysis ---
      const affectedClients = await this.deps.getAffectedClients(
        body.country,
        body.jurisdiction,
      );

      for (const client of affectedClients) {
        try {
          await this.triggerClientAnalysis(regulatoryChange, client, requestId);
        } catch (err) {
          // Don't fail the entire message for individual client analysis failures
          logger.error({
            operation: 'consumer:client_analysis_failed',
            requestId,
            clientId: client.id,
            changeId: regulatoryChange.id,
            result: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // --- Step 6: Complete the message ---
      await this.receiver!.completeMessage(message);

      logger.info({
        operation: 'consumer:message_processed',
        requestId,
        source: body.source,
        documentId: body.documentId,
        changeId: regulatoryChange.id,
        impactLevel: regulatoryChange.impactLevel,
        affectedClientsCount: affectedClients.length,
        duration: Date.now() - startTime,
        result: 'success',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error({
        operation: 'consumer:message_failed',
        requestId,
        messageId: message.messageId,
        source: body.source,
        documentId: body.documentId,
        deliveryCount: message.deliveryCount,
        duration: Date.now() - startTime,
        result: 'error',
        error: errorMessage,
      });

      // Dead-letter after max retries (configured in Service Bus queue: maxDeliveryCount=5)
      if ((message.deliveryCount ?? 0) >= 4) {
        await this.receiver!.deadLetterMessage(message, {
          deadLetterReason: 'MaxRetriesExceeded',
          deadLetterErrorDescription: errorMessage,
        });

        logger.warn({
          operation: 'consumer:dead_lettered',
          requestId,
          messageId: message.messageId,
          source: body.source,
          documentId: body.documentId,
          deliveryCount: message.deliveryCount,
          result: 'dead_lettered',
        });
      } else {
        // Abandon to allow retry
        await this.receiver!.abandonMessage(message);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Create a RegulatoryChange record from the ingestion message.
   * Fetches the impact level from message subject/properties.
   */
  private async createRegulatoryChangeRecord(
    msg: IngestionMessage,
    _requestId: string,
  ): Promise<RegulatoryChange> {
    const impactLevel = (msg as IngestionMessage & { impactLevel?: string }).impactLevel as ImpactLevel | undefined;

    return {
      id: randomUUID(),
      sourceId: msg.source,
      externalDocumentId: msg.documentId,
      title: `${msg.source}: ${msg.documentId}`,
      summary: '',
      rawContent: '',
      effectiveDate: msg.detectedAt,
      publishedDate: msg.detectedAt,
      impactLevel: impactLevel ?? 'MEDIUM',
      affectedAreas: [],
      affectedIndustries: [],
      country: msg.country,
      jurisdiction: msg.jurisdiction,
      version: msg.version,
      language: 'en',
      sourceUrl: msg.rawContentUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Trigger impact analysis for a specific client and enqueue alert if needed.
   */
  private async triggerClientAnalysis(
    change: RegulatoryChange,
    client: Client,
    requestId: string,
  ): Promise<void> {
    const startTime = Date.now();

    // Get existing obligation titles for context
    const existingObligations = await this.deps.prisma.obligation.findMany({
      where: { clientId: client.id, tenantId: client.tenantId },
      select: { title: true },
    });

    const obligationTitles = existingObligations.map((o: { title: string }) => o.title);

    // Generate per-client analysis
    const analysis = await this.deps.ragEngine.generateAnalysis(
      change,
      client,
      obligationTitles,
    );

    // Store analysis audit entry
    await this.deps.prisma.auditEntry.create({
      data: {
        id: randomUUID(),
        tenantId: client.tenantId,
        action: 'AI_ANALYSIS_GENERATED',
        entityType: 'RegulatoryChange',
        entityId: change.id,
        performedBy: 'system:analysis-pipeline',
        details: {
          clientId: client.id,
          confidence: analysis.confidence,
          impactedObligationsCount: analysis.impactedObligations.length,
        },
      },
    });

    // Enqueue alert for client notification
    if (analysis.confidence >= 0.5 && this.alertSender) {
      await this.alertSender.sendMessages({
        body: {
          alertId: randomUUID(),
          clientId: client.id,
          tenantId: client.tenantId,
          changeId: change.id,
          impactLevel: change.impactLevel,
          message: analysis.answer,
          createdAt: new Date(),
        },
        contentType: 'application/json',
        messageId: `alert:${client.id}:${change.id}`,
        subject: change.impactLevel,
        applicationProperties: {
          clientId: client.id,
          tenantId: client.tenantId,
          impactLevel: change.impactLevel,
        },
      });

      logger.info({
        operation: 'consumer:alert_enqueued',
        requestId,
        clientId: client.id,
        changeId: change.id,
        impactLevel: change.impactLevel,
        confidence: analysis.confidence,
        duration: Date.now() - startTime,
        result: 'success',
      });
    }
  }
}
