-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASS', 'WARNING', 'FAIL', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('DIRECTLY_ANSWERED', 'PARTIALLY_ANSWERED', 'NOT_ANSWERED');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('PENDING', 'APPROVED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FixStatus" AS ENUM ('GENERATED', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "ImplementationType" AS ENUM ('META_TITLE', 'META_DESCRIPTION', 'JSON_LD', 'FAQ', 'ANSWER_SECTION', 'INTERNAL_LINK', 'CONTENT_UPDATE', 'PAGE_OUTLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('ORGANIZATION', 'PERSON', 'PRODUCT', 'SERVICE', 'LOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('QUEUED', 'CRAWLING', 'ANALYZING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websites" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_jobs" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'QUEUED',
    "maxPages" INTEGER NOT NULL DEFAULT 100,
    "maxDepth" INTEGER NOT NULL DEFAULT 4,
    "concurrency" INTEGER NOT NULL DEFAULT 4,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "userAgent" TEXT NOT NULL DEFAULT 'AISearchReadinessBot/1.0 (+https://example.com/bot)',
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "statusMessage" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_errors" (
    "id" TEXT NOT NULL,
    "crawlJobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "crawlJobId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "statusCode" INTEGER,
    "redirectedFrom" TEXT,
    "isIndexable" BOOLEAN NOT NULL DEFAULT true,
    "robotsMeta" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "headings" JSONB,
    "contentText" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "ogData" JSONB,
    "twitterData" JSONB,
    "jsonLd" JSONB,
    "images" JSONB,
    "fetchTimeMs" INTEGER,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crawledAt" TIMESTAMP(3),

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_links" (
    "id" TEXT NOT NULL,
    "sourcePageId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "targetPageId" TEXT,
    "anchorText" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "isBroken" BOOLEAN NOT NULL DEFAULT false,
    "statusCode" INTEGER,

    CONSTRAINT "page_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_checks" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "pageId" TEXT,
    "checkId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "severity" "Severity" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_analyses" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "paragraphCount" INTEGER NOT NULL DEFAULT 0,
    "avgSentenceLength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "readabilityScore" DOUBLE PRECISION,
    "duplicateOfPageId" TEXT,
    "thinContent" BOOLEAN NOT NULL DEFAULT false,
    "topics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "sourcePageId" TEXT,
    "name" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "description" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "relationships" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_analyses" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "schemaType" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "errors" JSONB,
    "rawJsonLd" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo_analyses" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "questionCoverageScore" DOUBLE PRECISION NOT NULL,
    "answerDirectnessScore" DOUBLE PRECISION NOT NULL,
    "contentStructureScore" DOUBLE PRECISION NOT NULL,
    "faqCoverageScore" DOUBLE PRECISION NOT NULL,
    "entityClarityScore" DOUBLE PRECISION NOT NULL,
    "structuredDataScore" DOUBLE PRECISION NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aeo_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_analyses" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "entityClarityScore" DOUBLE PRECISION NOT NULL,
    "topicalCoverageScore" DOUBLE PRECISION NOT NULL,
    "contentQualityScore" DOUBLE PRECISION NOT NULL,
    "machineReadabilityScore" DOUBLE PRECISION NOT NULL,
    "citationReadinessScore" DOUBLE PRECISION NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queries" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "sourcePageId" TEXT,
    "query" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "topic" TEXT,
    "entity" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "status" "QueryStatus" NOT NULL DEFAULT 'PENDING',
    "groupName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_results" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetMentioned" BOOLEAN NOT NULL,
    "targetCited" BOOLEAN NOT NULL,
    "citedUrls" JSONB,
    "competingBrands" JSONB,
    "competingUrls" JSONB,
    "answerSummary" TEXT,
    "citationPosition" INTEGER,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "targetWebsiteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_analyses" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "technicalSeoScore" DOUBLE PRECISION NOT NULL,
    "contentScore" DOUBLE PRECISION NOT NULL,
    "questionCoverageScore" DOUBLE PRECISION NOT NULL,
    "entityClarityScore" DOUBLE PRECISION NOT NULL,
    "structuredDataScore" DOUBLE PRECISION NOT NULL,
    "internalLinkingScore" DOUBLE PRECISION NOT NULL,
    "aeoScore" DOUBLE PRECISION NOT NULL,
    "geoScore" DOUBLE PRECISION NOT NULL,
    "citationScore" DOUBLE PRECISION NOT NULL,
    "contentDepthScore" DOUBLE PRECISION NOT NULL,
    "gaps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "impact" INTEGER NOT NULL,
    "effort" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "example" TEXT,
    "affectedUrl" TEXT,
    "implementationType" "ImplementationType" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_fixes" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "type" "ImplementationType" NOT NULL,
    "before" TEXT,
    "after" TEXT NOT NULL,
    "status" "FixStatus" NOT NULL DEFAULT 'GENERATED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_fixes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "normalizedScore" DOUBLE PRECISION NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "crawlJobId" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
    "overallScore" DOUBLE PRECISION,
    "calculationVersion" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_changes" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "fromAuditId" TEXT,
    "toAuditId" TEXT NOT NULL,
    "scoreDelta" JSONB NOT NULL,
    "newIssues" JSONB NOT NULL,
    "resolvedIssues" JSONB NOT NULL,
    "newPages" JSONB NOT NULL,
    "removedPages" JSONB NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PDF',
    "filePath" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "websites_workspaceId_idx" ON "websites"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "websites_workspaceId_url_key" ON "websites"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "crawl_jobs_websiteId_idx" ON "crawl_jobs"("websiteId");

-- CreateIndex
CREATE INDEX "crawl_errors_crawlJobId_idx" ON "crawl_errors"("crawlJobId");

-- CreateIndex
CREATE INDEX "pages_crawlJobId_idx" ON "pages"("crawlJobId");

-- CreateIndex
CREATE INDEX "pages_websiteId_idx" ON "pages"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "pages_crawlJobId_normalizedUrl_key" ON "pages"("crawlJobId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "page_links_sourcePageId_idx" ON "page_links"("sourcePageId");

-- CreateIndex
CREATE INDEX "page_links_targetPageId_idx" ON "page_links"("targetPageId");

-- CreateIndex
CREATE INDEX "seo_checks_auditId_idx" ON "seo_checks"("auditId");

-- CreateIndex
CREATE INDEX "seo_checks_pageId_idx" ON "seo_checks"("pageId");

-- CreateIndex
CREATE INDEX "seo_checks_checkId_idx" ON "seo_checks"("checkId");

-- CreateIndex
CREATE UNIQUE INDEX "content_analyses_pageId_key" ON "content_analyses"("pageId");

-- CreateIndex
CREATE INDEX "content_analyses_auditId_idx" ON "content_analyses"("auditId");

-- CreateIndex
CREATE INDEX "entities_websiteId_idx" ON "entities"("websiteId");

-- CreateIndex
CREATE INDEX "entities_auditId_idx" ON "entities"("auditId");

-- CreateIndex
CREATE INDEX "schema_analyses_pageId_idx" ON "schema_analyses"("pageId");

-- CreateIndex
CREATE INDEX "schema_analyses_auditId_idx" ON "schema_analyses"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "aeo_analyses_pageId_key" ON "aeo_analyses"("pageId");

-- CreateIndex
CREATE INDEX "aeo_analyses_auditId_idx" ON "aeo_analyses"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "geo_analyses_auditId_key" ON "geo_analyses"("auditId");

-- CreateIndex
CREATE INDEX "queries_websiteId_idx" ON "queries"("websiteId");

-- CreateIndex
CREATE INDEX "queries_auditId_idx" ON "queries"("auditId");

-- CreateIndex
CREATE INDEX "query_results_queryId_idx" ON "query_results"("queryId");

-- CreateIndex
CREATE INDEX "competitors_targetWebsiteId_idx" ON "competitors"("targetWebsiteId");

-- CreateIndex
CREATE INDEX "competitor_analyses_competitorId_idx" ON "competitor_analyses"("competitorId");

-- CreateIndex
CREATE INDEX "competitor_analyses_auditId_idx" ON "competitor_analyses"("auditId");

-- CreateIndex
CREATE INDEX "recommendations_auditId_idx" ON "recommendations"("auditId");

-- CreateIndex
CREATE INDEX "generated_fixes_recommendationId_idx" ON "generated_fixes"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "score_versions_version_key" ON "score_versions"("version");

-- CreateIndex
CREATE INDEX "scores_auditId_idx" ON "scores"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "scores_auditId_category_key" ON "scores"("auditId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "audits_crawlJobId_key" ON "audits"("crawlJobId");

-- CreateIndex
CREATE INDEX "audits_websiteId_idx" ON "audits"("websiteId");

-- CreateIndex
CREATE INDEX "audit_changes_websiteId_idx" ON "audit_changes"("websiteId");

-- CreateIndex
CREATE INDEX "reports_auditId_idx" ON "reports"("auditId");

-- CreateIndex
CREATE INDEX "audit_log_entries_workspaceId_idx" ON "audit_log_entries"("workspaceId");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websites" ADD CONSTRAINT "websites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_errors" ADD CONSTRAINT "crawl_errors_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "crawl_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "crawl_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_links" ADD CONSTRAINT "page_links_targetPageId_fkey" FOREIGN KEY ("targetPageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_checks" ADD CONSTRAINT "seo_checks_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_checks" ADD CONSTRAINT "seo_checks_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_analyses" ADD CONSTRAINT "content_analyses_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_analyses" ADD CONSTRAINT "schema_analyses_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_analyses" ADD CONSTRAINT "schema_analyses_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_analyses" ADD CONSTRAINT "aeo_analyses_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_analyses" ADD CONSTRAINT "aeo_analyses_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_analyses" ADD CONSTRAINT "geo_analyses_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_results" ADD CONSTRAINT "query_results_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_targetWebsiteId_fkey" FOREIGN KEY ("targetWebsiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_analyses" ADD CONSTRAINT "competitor_analyses_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_analyses" ADD CONSTRAINT "competitor_analyses_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_fixes" ADD CONSTRAINT "generated_fixes_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_fixes" ADD CONSTRAINT "generated_fixes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_calculationVersion_fkey" FOREIGN KEY ("calculationVersion") REFERENCES "score_versions"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "crawl_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_changes" ADD CONSTRAINT "audit_changes_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_changes" ADD CONSTRAINT "audit_changes_fromAuditId_fkey" FOREIGN KEY ("fromAuditId") REFERENCES "audits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_changes" ADD CONSTRAINT "audit_changes_toAuditId_fkey" FOREIGN KEY ("toAuditId") REFERENCES "audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
