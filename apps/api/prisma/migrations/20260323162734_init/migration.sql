-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROFESSIONAL', 'CLIENT_VIEWER');

-- CreateEnum
CREATE TYPE "RegulatorySourceType" AS ENUM ('LEGISLATIVE', 'REGULATORY', 'GUIDANCE', 'ENFORCEMENT');

-- CreateEnum
CREATE TYPE "SourceConnectorType" AS ENUM ('API', 'RSS', 'SCRAPING');

-- CreateEnum
CREATE TYPE "SourceFrequency" AS ENUM ('every_10min', 'hourly', 'daily');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('OK', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ImpactLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('EMAIL', 'TEAMS', 'SSE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'SENT', 'ACKNOWLEDGED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('REGULATION_INGESTED', 'AI_ANALYSIS_GENERATED', 'ALERT_CREATED', 'ALERT_APPROVED', 'ALERT_SENT', 'ALERT_ACKNOWLEDGED', 'OBLIGATION_CREATED', 'OBLIGATION_UPDATED', 'CLIENT_ONBOARDED');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[],
    "company_type" TEXT NOT NULL,
    "industries" TEXT[],
    "contact_email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "onboarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "RegulatorySourceType" NOT NULL,
    "connector_type" "SourceConnectorType" NOT NULL DEFAULT 'API',
    "last_checked" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "check_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "base_url" TEXT NOT NULL DEFAULT '',
    "headers" JSONB NOT NULL DEFAULT '{}',
    "regulatory_area" TEXT NOT NULL DEFAULT '',
    "frequency" "SourceFrequency" NOT NULL DEFAULT 'hourly',
    "status" "SourceStatus" NOT NULL DEFAULT 'OK',
    "last_error" TEXT,
    "docs_indexed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_changes" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "external_document_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "raw_content" TEXT NOT NULL DEFAULT '',
    "effective_date" DATE NOT NULL,
    "published_date" DATE NOT NULL,
    "impact_level" "ImpactLevel" NOT NULL,
    "affected_areas" TEXT[],
    "affected_industries" TEXT[],
    "country" VARCHAR(2) NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "source_url" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regulatory_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "deadline" DATE NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_to" TEXT NOT NULL DEFAULT '',
    "priority" "ImpactLevel" NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "obligation_id" UUID,
    "message" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "impact_level" "ImpactLevel" NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "performed_by_id" UUID NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "documents_found" INTEGER NOT NULL DEFAULT 0,
    "documents_new" INTEGER NOT NULL DEFAULT 0,
    "documents_skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "clients_tenant_id_idx" ON "clients"("tenant_id");

-- CreateIndex
CREATE INDEX "clients_tenant_id_is_active_idx" ON "clients"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenant_id_name_key" ON "clients"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "regulatory_sources_is_active_idx" ON "regulatory_sources"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_sources_country_name_key" ON "regulatory_sources"("country", "name");

-- CreateIndex
CREATE INDEX "regulatory_changes_country_idx" ON "regulatory_changes"("country");

-- CreateIndex
CREATE INDEX "regulatory_changes_impact_level_idx" ON "regulatory_changes"("impact_level");

-- CreateIndex
CREATE INDEX "regulatory_changes_published_date_idx" ON "regulatory_changes"("published_date");

-- CreateIndex
CREATE INDEX "regulatory_changes_source_id_idx" ON "regulatory_changes"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_idempotency_key" ON "regulatory_changes"("source_id", "external_document_id", "version");

-- CreateIndex
CREATE INDEX "obligations_tenant_id_idx" ON "obligations"("tenant_id");

-- CreateIndex
CREATE INDEX "obligations_client_id_idx" ON "obligations"("client_id");

-- CreateIndex
CREATE INDEX "obligations_tenant_id_status_idx" ON "obligations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "obligations_tenant_id_deadline_idx" ON "obligations"("tenant_id", "deadline");

-- CreateIndex
CREATE INDEX "alerts_tenant_id_idx" ON "alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "alerts_tenant_id_status_idx" ON "alerts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "alerts_client_id_idx" ON "alerts"("client_id");

-- CreateIndex
CREATE INDEX "alerts_status_impact_level_idx" ON "alerts"("status", "impact_level");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_idx" ON "audit_log"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_action_idx" ON "audit_log"("tenant_id", "action");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "ingestion_runs_source_id_idx" ON "ingestion_runs"("source_id");

-- CreateIndex
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs"("started_at");

-- CreateIndex
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs"("status");

-- AddForeignKey
ALTER TABLE "regulatory_changes" ADD CONSTRAINT "regulatory_changes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "regulatory_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "regulatory_changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "regulatory_changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "regulatory_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
