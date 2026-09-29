import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrawlerService } from '../crawler/crawler.service';
import { TechnicalSeoAnalyzerService } from '../analysis/technical-seo/technical-seo-analyzer.service';
import { ContentAnalyzerService } from '../analysis/content/content-analyzer.service';
import { EntityAnalyzerService } from '../analysis/content/entity-analyzer.service';
import { SchemaAnalyzerService } from '../analysis/content/schema-analyzer.service';
import { AeoAnalyzerService } from '../analysis/aeo/aeo-analyzer.service';
import { GeoAnalyzerService } from '../analysis/geo/geo-analyzer.service';
import { ScoringService } from '../scoring/scoring.service';
import { QueryGeneratorService } from '../queries/query-generator.service';
import { RecommendationEngineService } from '../recommendations/recommendation-engine.service';
import { CreateAuditDto } from './dto/create-audit.dto';

/**
 * Orchestrates the full "Killer User Workflow" (spec section 25):
 * crawl -> technical SEO -> content/entity/schema -> AEO -> GEO -> scoring ->
 * query generation -> recommendations. Runs as a background pipeline so the
 * HTTP request that creates the audit returns immediately (spec section 20).
 */
@Injectable()
export class AuditsService {
  private readonly logger = new Logger(AuditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: CrawlerService,
    private readonly technicalSeoAnalyzer: TechnicalSeoAnalyzerService,
    private readonly contentAnalyzer: ContentAnalyzerService,
    private readonly entityAnalyzer: EntityAnalyzerService,
    private readonly schemaAnalyzer: SchemaAnalyzerService,
    private readonly aeoAnalyzer: AeoAnalyzerService,
    private readonly geoAnalyzer: GeoAnalyzerService,
    private readonly scoring: ScoringService,
    private readonly queryGenerator: QueryGeneratorService,
    private readonly recommendationEngine: RecommendationEngineService,
  ) {}

  async createAudit(websiteId: string, dto: CreateAuditDto) {
    const website = await this.prisma.website.findUniqueOrThrow({ where: { id: websiteId } });

    const crawlJob = await this.crawler.createCrawlJob(website.id, {
      maxPages: dto.maxPages,
      maxDepth: dto.maxDepth,
    });

    const audit = await this.prisma.audit.create({
      data: {
        websiteId: website.id,
        crawlJobId: crawlJob.id,
        status: 'QUEUED',
      },
    });

    // Fire-and-forget: the HTTP handler must not block on the full pipeline.
    this.runPipeline(audit.id).catch((err) => {
      this.logger.error(`Audit pipeline failed for audit ${audit.id}: ${err?.message}`, err?.stack);
    });

    return audit;
  }

  async runPipeline(auditId: string): Promise<void> {
    const audit = await this.prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
    if (!audit.crawlJobId) {
      throw new Error(`Audit ${auditId} has no associated crawl job`);
    }

    try {
      await this.prisma.audit.update({
        where: { id: auditId },
        data: { status: 'CRAWLING', startedAt: new Date() },
      });
      await this.crawler.runCrawlJob(audit.crawlJobId);

      const crawlJob = await this.prisma.crawlJob.findUniqueOrThrow({
        where: { id: audit.crawlJobId },
      });
      if (crawlJob.status === 'FAILED') {
        throw new Error(crawlJob.error ?? 'Crawl failed');
      }

      await this.prisma.audit.update({ where: { id: auditId }, data: { status: 'ANALYZING' } });

      await this.technicalSeoAnalyzer.analyze(auditId, audit.crawlJobId);
      await this.contentAnalyzer.analyze(auditId, audit.crawlJobId);
      await this.entityAnalyzer.analyze(auditId, audit.websiteId, audit.crawlJobId);
      await this.schemaAnalyzer.analyze(auditId, audit.crawlJobId);
      await this.aeoAnalyzer.analyze(auditId, audit.crawlJobId);
      await this.geoAnalyzer.analyze(auditId);

      await this.scoring.computeScores(auditId);
      await this.queryGenerator.generateQueries(auditId, audit.websiteId);
      await this.recommendationEngine.generateRecommendations(auditId);

      await this.prisma.audit.update({
        where: { id: auditId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (err: any) {
      await this.prisma.audit.update({
        where: { id: auditId },
        data: { status: 'FAILED', error: err?.message ?? 'Unknown error', completedAt: new Date() },
      });
      throw err;
    }
  }

  async getStatus(auditId: string) {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      include: { crawlJob: true },
    });
    if (!audit) throw new NotFoundException('Audit not found');

    let progress = 0;
    let statusMessage = 'Queued';
    switch (audit.status) {
      case 'QUEUED':
        progress = 0;
        statusMessage = 'Waiting to start';
        break;
      case 'CRAWLING':
        progress = Math.round((audit.crawlJob?.progress ?? 0) * 0.5);
        statusMessage = audit.crawlJob?.statusMessage ?? 'Crawling website';
        break;
      case 'ANALYZING':
        progress = 75;
        statusMessage = 'Running analyzers and scoring';
        break;
      case 'COMPLETED':
        progress = 100;
        statusMessage = 'Completed';
        break;
      case 'FAILED':
        progress = 100;
        statusMessage = audit.error ?? 'Failed';
        break;
    }

    return { id: audit.id, status: audit.status, progress, statusMessage, error: audit.error };
  }

  async listForWebsite(websiteId: string) {
    return this.prisma.audit.findMany({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAudit(auditId: string) {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        website: true,
        crawlJob: { include: { errors: true } },
        scores: true,
        seoChecks: { include: { page: true } },
        contentAnalyses: true,
        entities: true,
        schemaAnalyses: true,
        aeoAnalyses: { include: { page: true } },
        geoAnalysis: true,
        queries: { include: { results: true } },
        competitorAnalyses: { include: { competitor: true } },
        recommendations: { include: { fixes: true }, orderBy: { priority: 'desc' } },
      },
    });
    if (!audit) throw new NotFoundException('Audit not found');
    return audit;
  }

  /**
   * Milestone 11 (Historical Tracking, spec section 16): diff two completed
   * audits of the same website and persist the result as an AuditChange row.
   */
  async compareAudits(websiteId: string, fromAuditId: string, toAuditId: string) {
    const [fromAudit, toAudit] = await Promise.all([
      this.prisma.audit.findUniqueOrThrow({
        where: { id: fromAuditId },
        include: { scores: true, seoChecks: true, crawlJob: { include: { pages: true } } },
      }),
      this.prisma.audit.findUniqueOrThrow({
        where: { id: toAuditId },
        include: { scores: true, seoChecks: true, crawlJob: { include: { pages: true } } },
      }),
    ]);

    const scoreDelta: Record<string, { from: number; to: number; delta: number }> = {};
    const fromScoreMap = new Map(fromAudit.scores.map((s) => [s.category, s.normalizedScore]));
    for (const score of toAudit.scores) {
      const fromScore = fromScoreMap.get(score.category) ?? 0;
      scoreDelta[score.category] = {
        from: fromScore,
        to: score.normalizedScore,
        delta: score.normalizedScore - fromScore,
      };
    }

    const fromFailedChecks = new Set(
      fromAudit.seoChecks.filter((c) => c.status === 'FAIL').map((c) => `${c.checkId}:${c.pageId}`),
    );
    const toFailedChecks = toAudit.seoChecks.filter((c) => c.status === 'FAIL');
    const toFailedKeySet = new Set(toFailedChecks.map((c) => `${c.checkId}:${c.pageId}`));

    const newIssues = toFailedChecks
      .filter((c) => !fromFailedChecks.has(`${c.checkId}:${c.pageId}`))
      .map((c) => ({ checkId: c.checkId, pageId: c.pageId, evidence: c.evidence }));

    const resolvedIssues = fromAudit.seoChecks
      .filter((c) => c.status === 'FAIL' && !toFailedKeySet.has(`${c.checkId}:${c.pageId}`))
      .map((c) => ({ checkId: c.checkId, pageId: c.pageId, evidence: c.evidence }));

    const fromUrls = new Set(fromAudit.crawlJob?.pages.map((p) => p.normalizedUrl) ?? []);
    const toUrls = new Set(toAudit.crawlJob?.pages.map((p) => p.normalizedUrl) ?? []);
    const newPages = [...toUrls].filter((u) => !fromUrls.has(u));
    const removedPages = [...fromUrls].filter((u) => !toUrls.has(u));

    const overallDelta = (toAudit.overallScore ?? 0) - (fromAudit.overallScore ?? 0);
    const summary = `Score ${overallDelta >= 0 ? 'improved' : 'declined'} from ${fromAudit.overallScore ?? 0} to ${toAudit.overallScore ?? 0} (${overallDelta >= 0 ? '+' : ''}${overallDelta.toFixed(1)}). ${newIssues.length} new issue(s), ${resolvedIssues.length} resolved.`;

    return this.prisma.auditChange.create({
      data: {
        websiteId,
        fromAuditId,
        toAuditId,
        scoreDelta,
        newIssues,
        resolvedIssues,
        newPages,
        removedPages,
        summary,
      },
    });
  }
}
