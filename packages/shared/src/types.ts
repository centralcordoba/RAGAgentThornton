// ============================================================================
// RegWatch AI — Core Domain Types
// TypeScript strict mode — no `any` allowed
// ============================================================================

// ---------------------------------------------------------------------------
// Enums & Literals
// ---------------------------------------------------------------------------

export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertChannel = 'EMAIL' | 'TEAMS' | 'SSE';

export type AlertStatus = 'PENDING_REVIEW' | 'APPROVED' | 'SENT' | 'ACKNOWLEDGED' | 'DISMISSED';

export type ObligationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'WAIVED';

export type RegulatorySourceType = 'LEGISLATIVE' | 'REGULATORY' | 'GUIDANCE' | 'ENFORCEMENT';

export type ComplianceNodeType =
  | 'JURISDICTION'
  | 'COMPANY_TYPE'
  | 'OBLIGATION'
  | 'DEADLINE'
  | 'REGULATOR'
  | 'REGULATION'
  | 'INDUSTRY';

export type AuditAction =
  | 'REGULATION_INGESTED'
  | 'AI_ANALYSIS_GENERATED'
  | 'ALERT_CREATED'
  | 'ALERT_APPROVED'
  | 'ALERT_SENT'
  | 'ALERT_ACKNOWLEDGED'
  | 'OBLIGATION_CREATED'
  | 'OBLIGATION_UPDATED'
  | 'CLIENT_ONBOARDED';

export type UserRole = 'ADMIN' | 'PROFESSIONAL' | 'CLIENT_VIEWER';

// ---------------------------------------------------------------------------
// Regulatory Sources
// ---------------------------------------------------------------------------

export interface RegulatorySource {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly jurisdiction: string;
  readonly url: string;
  readonly type: RegulatorySourceType;
  readonly lastChecked: Date;
  readonly isActive: boolean;
  readonly checkIntervalMinutes: number;
}

// ---------------------------------------------------------------------------
// Regulatory Changes
// ---------------------------------------------------------------------------

export interface RegulatoryChange {
  readonly id: string;
  readonly sourceId: string;
  readonly externalDocumentId: string;
  readonly title: string;
  readonly summary: string;
  readonly rawContent: string;
  readonly effectiveDate: Date;
  readonly publishedDate: Date;
  readonly impactLevel: ImpactLevel;
  readonly affectedAreas: readonly string[];
  readonly affectedIndustries: readonly string[];
  readonly country: string;
  readonly jurisdiction: string;
  readonly version: string;
  readonly language: string;
  readonly sourceUrl: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Idempotency key: source + documentId + version */
export interface IngestionKey {
  readonly source: string;
  readonly documentId: string;
  readonly version: string;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface Client {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly countries: readonly string[];
  readonly companyType: string;
  readonly industries: readonly string[];
  readonly contactEmail: string;
  readonly isActive: boolean;
  readonly onboardedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

export interface Obligation {
  readonly id: string;
  readonly clientId: string;
  readonly tenantId: string;
  readonly changeId: string;
  readonly title: string;
  readonly description: string;
  readonly deadline: Date;
  readonly status: ObligationStatus;
  readonly assignedTo: string;
  readonly priority: ImpactLevel;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface Alert {
  readonly id: string;
  readonly clientId: string;
  readonly tenantId: string;
  readonly changeId: string;
  readonly obligationId: string | null;
  readonly message: string;
  readonly channel: AlertChannel;
  readonly status: AlertStatus;
  readonly impactLevel: ImpactLevel;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly sentAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Knowledge Graph — ComplianceGraph
// ---------------------------------------------------------------------------

export interface ComplianceNode {
  readonly id: string;
  readonly type: ComplianceNodeType;
  readonly label: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface ComplianceEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationship: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface ComplianceGraph {
  readonly nodes: readonly ComplianceNode[];
  readonly edges: readonly ComplianceEdge[];
}

// ---------------------------------------------------------------------------
// AI / RAG Response
// ---------------------------------------------------------------------------

export interface AIAnalysis {
  readonly answer: string;
  readonly sources: readonly AISource[];
  readonly confidence: number;
  readonly reasoning: string;
  readonly impactedObligations: readonly string[];
}

export interface AISource {
  readonly documentId: string;
  readonly title: string;
  readonly relevanceScore: number;
  readonly snippet: string;
  readonly sourceUrl: string;
}

export interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
}

export interface ChatRequest {
  readonly tenantId: string;
  readonly clientId: string;
  readonly message: string;
  readonly conversationId: string | null;
  readonly filters: ChatFilters | null;
}

export interface ChatFilters {
  readonly countries: readonly string[] | null;
  readonly industries: readonly string[] | null;
  readonly impactLevel: ImpactLevel | null;
  readonly dateFrom: Date | null;
  readonly dateTo: Date | null;
}

export interface ChatResponse {
  readonly conversationId: string;
  readonly analysis: AIAnalysis;
  readonly relatedObligations: readonly Obligation[];
  readonly cached: boolean;
}

// ---------------------------------------------------------------------------
// Users & Auth
// ---------------------------------------------------------------------------

export interface User {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface AuthTokenPayload {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly iat: number;
  readonly exp: number;
}

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

export interface AuditEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly performedBy: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// API — Common Shapes
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface PaginationParams {
  readonly page: number;
  readonly pageSize: number;
}

export interface HealthCheckResponse {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly version: string;
  readonly timestamp: Date;
  readonly services: Readonly<Record<string, ServiceHealth>>;
}

export interface ServiceHealth {
  readonly status: 'up' | 'down' | 'degraded';
  readonly latencyMs: number | null;
  readonly message: string | null;
}

// ---------------------------------------------------------------------------
// Service Bus Messages
// ---------------------------------------------------------------------------

export interface IngestionMessage {
  readonly source: string;
  readonly documentId: string;
  readonly version: string;
  readonly rawContentUrl: string;
  readonly country: string;
  readonly jurisdiction: string;
  readonly detectedAt: Date;
}

export interface AlertReviewMessage {
  readonly alertId: string;
  readonly clientId: string;
  readonly tenantId: string;
  readonly changeId: string;
  readonly impactLevel: ImpactLevel;
  readonly message: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface ClientDashboard {
  readonly clientId: string;
  readonly tenantId: string;
  readonly complianceScore: number;
  readonly totalObligations: number;
  readonly obligationsByStatus: Readonly<Record<ObligationStatus, number>>;
  readonly recentChanges: readonly RegulatoryChange[];
  readonly pendingAlerts: readonly Alert[];
  readonly upcomingDeadlines: readonly Obligation[];
}

// ---------------------------------------------------------------------------
// Regulatory Source Management (Phase 7)
// ---------------------------------------------------------------------------

export type SourceConnectorType = 'API' | 'RSS' | 'SCRAPING';

export type SourceStatus = 'OK' | 'WARNING' | 'ERROR';

export interface ManagedRegulatorySource {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly type: SourceConnectorType;
  readonly status: SourceStatus;
  readonly lastFetch: Date | null;
  readonly docsIndexed: number;
  readonly lastError: string | null;
  readonly frequency: 'every_10min' | 'hourly' | 'daily';
  readonly active: boolean;
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly regulatoryArea: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateSourceInput {
  readonly name: string;
  readonly country: string;
  readonly type: SourceConnectorType;
  readonly frequency: 'every_10min' | 'hourly' | 'daily';
  readonly baseUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly regulatoryArea: string;
}

export interface SourceTestResult {
  readonly success: boolean;
  readonly statusCode: number | null;
  readonly errorMessage: string | null;
  readonly preview: readonly SourcePreviewDoc[];
}

export interface SourcePreviewDoc {
  readonly title: string;
  readonly date: string;
  readonly url: string;
  readonly snippet: string;
}

export interface SourceTriggerEvent {
  readonly event:
    | 'fetch_start'
    | 'docs_fetched'
    | 'changes_detected'
    | 'embeddings_generated'
    | 'alerts_triggered'
    | 'complete';
  readonly source: string;
  readonly timestamp: string;
  readonly count?: number;
  readonly cached?: number;
  readonly impactLevel?: ImpactLevel;
  readonly duration_ms?: number;
  readonly status?: 'OK' | 'ERROR';
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Ingestion Job
// ---------------------------------------------------------------------------

export interface IngestionJobResult {
  readonly source: string;
  readonly documentsFound: number;
  readonly documentsNew: number;
  readonly documentsSkipped: number;
  readonly errors: readonly IngestionError[];
  readonly durationMs: number;
}

export interface IngestionError {
  readonly documentId: string;
  readonly error: string;
  readonly retryable: boolean;
}
