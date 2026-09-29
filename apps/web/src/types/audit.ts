/**
 * Shared TypeScript shapes for the audit dashboard (WebsiteDetailPage and its
 * child components/hooks). Mirrors apps/api/prisma/schema.prisma and the
 * response shapes built by AuditsService.getAudit() / listForWebsite() /
 * getStatus(), plus QueriesController and RecommendationsController.
 *
 * ASSUMPTION: several JSON columns (Score.breakdown, AEOAnalysis.details,
 * GEOAnalysis.details, CompetitorAnalysis.gaps, Page.headings/jsonLd) are
 * analyzer-defined and still evolving (other agents are implementing the
 * analyzers concurrently - see docs/AGENT_BRIEF.md). They are typed as
 * `unknown` here and rendered defensively/generically rather than assuming a
 * fixed shape.
 */

export type AuditStatus = 'QUEUED' | 'CRAWLING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';

export type CheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_APPLICABLE';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RecommendationStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'DISMISSED';

export type FixStatus = 'GENERATED' | 'APPROVED' | 'REJECTED' | 'APPLIED';

export type QueryStatus = 'PENDING' | 'APPROVED' | 'EDITED' | 'REJECTED';

export type ImplementationType =
  | 'META_TITLE'
  | 'META_DESCRIPTION'
  | 'JSON_LD'
  | 'FAQ'
  | 'ANSWER_SECTION'
  | 'INTERNAL_LINK'
  | 'CONTENT_UPDATE'
  | 'PAGE_OUTLINE'
  | 'OTHER';

export type QueryTestingProviderName = 'OPENAI' | 'ANTHROPIC' | 'PERPLEXITY' | 'GOOGLE_AI_OVERVIEWS';

/**
 * Response shape of POST /audits/:auditId/queries/:queryId/test/:provider.
 * When status is not "OK" (e.g. NOT_CONFIGURED because no provider API key is
 * set in this environment) the result is NOT persisted as a QueryResult row -
 * the UI must render it honestly as a one-off, ephemeral response rather than
 * treat it like a stored result (see docs/AGENT_BRIEF.md: never fabricate a
 * citation/mention result).
 */
export interface QueryTestingResult {
  status: 'OK' | 'NOT_CONFIGURED' | 'ERROR';
  provider: string;
  targetMentioned: boolean | null;
  targetCited: boolean | null;
  citedUrls: string[];
  competingBrands: string[];
  competingUrls: string[];
  answerSummary: string | null;
  citationPosition: number | null;
  errorMessage?: string;
}

export interface Workspace {
  id: string;
  name: string;
  role: string;
}

export interface Website {
  id: string;
  url: string;
  name: string | null;
  domain: string;
  createdAt?: string;
}

/** Row shape from GET /workspaces/:workspaceId/websites/:websiteId/audits */
export interface AuditListItem {
  id: string;
  websiteId: string;
  crawlJobId: string | null;
  status: AuditStatus;
  overallScore: number | null;
  calculationVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /audits/:auditId/status */
export interface AuditStatusResponse {
  id: string;
  status: AuditStatus;
  progress: number;
  statusMessage: string;
  error: string | null;
}

export interface PageRef {
  id: string;
  url: string;
  normalizedUrl?: string;
  title?: string | null;
}

export interface ScoreRow {
  id: string;
  auditId: string;
  category: string;
  rawScore: number;
  weight: number;
  normalizedScore: number;
  calculationVersion: string;
  breakdown: unknown;
  createdAt: string;
}

export interface SEOCheckRow {
  id: string;
  auditId: string;
  pageId: string | null;
  checkId: string;
  category: string;
  status: CheckStatus;
  severity: Severity;
  score: number;
  evidence: string;
  recommendation: string;
  page?: PageRef | null;
  createdAt: string;
}

export interface ContentAnalysisRow {
  id: string;
  pageId: string;
  auditId: string;
  paragraphCount: number;
  avgSentenceLength: number;
  readabilityScore: number | null;
  duplicateOfPageId: string | null;
  thinContent: boolean;
  topics: unknown;
  createdAt: string;
}

export interface EntityRow {
  id: string;
  websiteId: string;
  auditId: string;
  sourcePageId: string | null;
  name: string;
  type: string;
  description: string | null;
  confidence: number;
  relationships: unknown;
  createdAt: string;
}

export interface SchemaAnalysisRow {
  id: string;
  pageId: string;
  auditId: string;
  schemaType: string;
  isValid: boolean;
  errors: unknown;
  rawJsonLd: unknown;
  createdAt: string;
}

export interface AeoQuestionDetail {
  question: string;
  status: string;
  evidence?: string;
  recommendation?: string;
}

export interface AEOAnalysisRow {
  id: string;
  auditId: string;
  pageId: string;
  questionCoverageScore: number;
  answerDirectnessScore: number;
  contentStructureScore: number;
  faqCoverageScore: number;
  entityClarityScore: number;
  structuredDataScore: number;
  overallScore: number;
  details: { questions?: AeoQuestionDetail[] } & Record<string, unknown>;
  page?: PageRef | null;
  createdAt: string;
}

export interface GEOAnalysisRow {
  id: string;
  auditId: string;
  entityClarityScore: number;
  topicalCoverageScore: number;
  contentQualityScore: number;
  machineReadabilityScore: number;
  citationReadinessScore: number;
  overallScore: number;
  details: unknown;
  createdAt: string;
}

export interface QueryResultRow {
  id: string;
  queryId: string;
  provider: string;
  timestamp: string;
  targetMentioned: boolean;
  targetCited: boolean;
  citedUrls: string[] | null;
  competingBrands: string[] | null;
  competingUrls: string[] | null;
  answerSummary: string | null;
  citationPosition: number | null;
  createdAt: string;
}

export interface QueryRow {
  id: string;
  websiteId: string;
  auditId: string;
  sourcePageId: string | null;
  query: string;
  intent: string;
  category: string;
  topic: string | null;
  entity: string | null;
  importance: number;
  status: QueryStatus;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
  results: QueryResultRow[];
}

export interface CompetitorRef {
  id: string;
  url: string;
  name: string | null;
}

export interface CompetitorAnalysisRow {
  id: string;
  competitorId: string;
  auditId: string;
  technicalSeoScore: number;
  contentScore: number;
  questionCoverageScore: number;
  entityClarityScore: number;
  structuredDataScore: number;
  internalLinkingScore: number;
  aeoScore: number;
  geoScore: number;
  citationScore: number;
  contentDepthScore: number;
  gaps: unknown;
  competitor?: CompetitorRef;
  createdAt: string;
}

export interface GeneratedFixRow {
  id: string;
  recommendationId: string;
  type: ImplementationType;
  before: string | null;
  after: string;
  status: FixStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface RecommendationRow {
  id: string;
  auditId: string;
  title: string;
  category: string;
  severity: Severity;
  impact: number;
  effort: number;
  confidence: number;
  priority: number;
  evidence: string;
  explanation: string;
  action: string;
  example: string | null;
  affectedUrl: string | null;
  implementationType: ImplementationType;
  status: RecommendationStatus;
  fixes: GeneratedFixRow[];
  createdAt: string;
  updatedAt: string;
}

export interface CrawlErrorRow {
  id: string;
  crawlJobId: string;
  url: string;
  message: string;
  createdAt: string;
}

export interface CrawlJobRow {
  id: string;
  websiteId: string;
  status: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  progress: number;
  statusMessage: string | null;
  error: string | null;
  errors: CrawlErrorRow[];
}

/** Full drill-down payload from GET /audits/:auditId */
export interface AuditDetail {
  id: string;
  websiteId: string;
  status: AuditStatus;
  overallScore: number | null;
  calculationVersion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  website: Website;
  crawlJob: CrawlJobRow | null;
  scores: ScoreRow[];
  seoChecks: SEOCheckRow[];
  contentAnalyses: ContentAnalysisRow[];
  entities: EntityRow[];
  schemaAnalyses: SchemaAnalysisRow[];
  aeoAnalyses: AEOAnalysisRow[];
  geoAnalysis: GEOAnalysisRow | null;
  queries: QueryRow[];
  competitorAnalyses: CompetitorAnalysisRow[];
  recommendations: RecommendationRow[];
}

/** Result of POST /workspaces/:workspaceId/websites/:websiteId/audit-changes */
export interface AuditChange {
  id: string;
  websiteId: string;
  fromAuditId: string | null;
  toAuditId: string;
  scoreDelta: Record<string, { from: number; to: number; delta: number }>;
  newIssues: Array<{ checkId: string; pageId: string | null; evidence: string }>;
  resolvedIssues: Array<{ checkId: string; pageId: string | null; evidence: string }>;
  newPages: string[];
  removedPages: string[];
  summary: string | null;
  createdAt: string;
}
