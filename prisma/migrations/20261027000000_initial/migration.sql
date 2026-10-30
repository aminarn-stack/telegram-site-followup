-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CONTRIBUTOR', 'VIEWER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('NORMAL', 'SHARED');

-- CreateEnum
CREATE TYPE "SectorAddition" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('LOCKED', 'ACTIONABLE', 'COMPLETED', 'BLOCKED', 'NOT_APPLICABLE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NotificationState" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRegion" (
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,

    CONSTRAINT "UserRegion_pkey" PRIMARY KEY ("userId","regionId")
);

-- CreateTable
CREATE TABLE "BotChat" (
    "id" TEXT NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "chatType" TEXT NOT NULL,
    "groupName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "importSummaries" BOOLEAN NOT NULL DEFAULT true,
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "escalations" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "reminderSchedule" TEXT NOT NULL DEFAULT '0 9 * * 1,3',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "reportingWeek" TIMESTAMP(3) NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalRows" INTEGER NOT NULL,
    "acceptedRows" INTEGER NOT NULL,
    "rejectedRows" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "siteIdText" TEXT,
    "regionText" TEXT,
    "siteTypeText" TEXT,
    "sectorText" TEXT,
    "normalizedData" JSONB,
    "errors" JSONB NOT NULL,
    "valid" BOOLEAN NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "siteIdText" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "siteType" "SiteType" NOT NULL,
    "sectorAddition" "SectorAddition" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAssignment" (
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("siteId","userId")
);

-- CreateTable
CREATE TABLE "SiteBatchMembership" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "importedSiteType" "SiteType" NOT NULL,
    "importedSectorAddition" "SectorAddition" NOT NULL,
    "classificationReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteBatchMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "siteType" "SiteType" NOT NULL,
    "sectorAddition" "SectorAddition" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "prerequisiteCode" TEXT,
    "stepType" TEXT NOT NULL,
    "allowedAnswers" JSONB NOT NULL,

    CONSTRAINT "WorkflowTemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteWorkflow" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "SiteStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SiteWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,
    "answer" TEXT,
    "state" "WorkflowState" NOT NULL,
    "comment" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepEvidence" (
    "id" TEXT NOT NULL,
    "siteStepId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "siteStepId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "notificationState" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recipientChatId" BIGINT NOT NULL,
    "messageType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "NotificationState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "telegramMessageId" BIGINT,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeepLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeepLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BotChat_telegramChatId_key" ON "BotChat"("telegramChatId");

-- CreateIndex
CREATE INDEX "ImportBatch_reportingWeek_idx" ON "ImportBatch"("reportingWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Site_publicId_key" ON "Site"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_siteIdText_key" ON "Site"("siteIdText");

-- CreateIndex
CREATE INDEX "Site_regionId_siteIdText_idx" ON "Site"("regionId", "siteIdText");

-- CreateIndex
CREATE UNIQUE INDEX "SiteBatchMembership_batchId_siteId_key" ON "SiteBatchMembership"("batchId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_code_version_key" ON "WorkflowTemplate"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_siteType_sectorAddition_version_key" ON "WorkflowTemplate"("siteType", "sectorAddition", "version");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplateStep_templateId_code_key" ON "WorkflowTemplateStep"("templateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplateStep_templateId_displayOrder_key" ON "WorkflowTemplateStep"("templateId", "displayOrder");

-- CreateIndex
CREATE INDEX "SiteWorkflow_siteId_active_idx" ON "SiteWorkflow"("siteId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SiteWorkflow_siteId_cycleNumber_key" ON "SiteWorkflow"("siteId", "cycleNumber");

-- CreateIndex
CREATE INDEX "SiteStep_workflowId_state_idx" ON "SiteStep"("workflowId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "SiteStep_workflowId_templateStepId_key" ON "SiteStep"("workflowId", "templateStepId");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_siteStepId_key" ON "Escalation"("siteStepId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_state_nextAttemptAt_idx" ON "Notification"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeepLinkToken_tokenHash_key" ON "DeepLinkToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "UserRegion" ADD CONSTRAINT "UserRegion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegion" ADD CONSTRAINT "UserRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteBatchMembership" ADD CONSTRAINT "SiteBatchMembership_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteBatchMembership" ADD CONSTRAINT "SiteBatchMembership_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateStep" ADD CONSTRAINT "WorkflowTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteWorkflow" ADD CONSTRAINT "SiteWorkflow_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteWorkflow" ADD CONSTRAINT "SiteWorkflow_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteStep" ADD CONSTRAINT "SiteStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "SiteWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteStep" ADD CONSTRAINT "SiteStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "WorkflowTemplateStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteStep" ADD CONSTRAINT "SiteStep_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepEvidence" ADD CONSTRAINT "StepEvidence_siteStepId_fkey" FOREIGN KEY ("siteStepId") REFERENCES "SiteStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepEvidence" ADD CONSTRAINT "StepEvidence_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_siteStepId_fkey" FOREIGN KEY ("siteStepId") REFERENCES "SiteStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
