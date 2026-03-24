-- CreateEnum
CREATE TYPE "RegulatoryStage" AS ENUM ('PROPOSED', 'COMMENT_PERIOD', 'FINAL_RULE', 'EFFECTIVE');

-- AlterTable
ALTER TABLE "regulatory_changes" ADD COLUMN     "approval_probability" DOUBLE PRECISION,
ADD COLUMN     "comment_deadline" DATE,
ADD COLUMN     "estimated_final_date" DATE,
ADD COLUMN     "proposed_effective_date" DATE,
ADD COLUMN     "proposing_agency" TEXT,
ADD COLUMN     "stage" "RegulatoryStage" NOT NULL DEFAULT 'EFFECTIVE';

-- CreateIndex
CREATE INDEX "regulatory_changes_stage_idx" ON "regulatory_changes"("stage");
