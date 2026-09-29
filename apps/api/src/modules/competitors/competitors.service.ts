import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertUrlIsSafeToFetch, SsrfViolationError } from '../../common/security/ssrf-guard';
import { CrawlerService } from '../crawler/crawler.service';
import { TechnicalSeoAnalyzerService } from '../analysis/technical-seo/technical-seo-analyzer.service';
import { ContentAnalyzerService } from '../analysis/content/content-analyzer.service';
import { EntityAnalyzerService } from '../analysis/content/entity-analyzer.service';
import { SchemaAnalyzerService } from '../analysis/content/schema-analyzer.service';
import { AeoAnalyzerService } from '../analysis/aeo/aeo-analyzer.service';
import { GeoAnalyzerService } from '../analysis/geo/geo-analyzer.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';

const COMPETITOR_CRAWL_MAX_PAGES = 20;

/**
 * Implements Milestone 8 / spec section 11 (Competitor Analysis). Runs the
 * exact same crawl -> analyze -> score pipeline used for the target website
 * against the competitor's own domain (spec: "Analyze the target and
 * competitors using the same methodology"), then diffs the resulting Score/
 * SchemaAnalysis/AEOAnalysis rows to produce evidence-backed gap findings.
 */
@Injectable()
export class CompetitorsService {
  private readonly logger = new Logger(CompetitorsService.name);

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
  ) {}

  async addCompetitor(targetWebsiteId: string, dto: CreateCompetitorDto) {
    try {
      await assertUrlIsSafeToFetch(dto.url);
    } catch (err) {
      if (err instanceof SsrfViolationError) {
        throw new BadRequestException(`URL is not allowed: ${err.message}`);
      }
      throw err;
    }
    return this.prisma.competitor.create({
      data: { targetWebsiteId, url: dto.url, name: dto.name },
    });
  }

  async list(targetWebsiteId: string) {
    return this.prisma.competitor.findMany({
      where: { targetWebsiteId },
      include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  /**
   * Crawls+analyzes the competitor under a shadow Website/Audit in the same
   * workspace, then writes a CompetitorAnalysis row comparing it to `auditId`
   * (an already-scored audit of the target website).
   */
  async analyzeCompetitor(auditId: string, competitorId: string): Promise<void> {
    const [targetAudit, competitor] = await Promise.all([
      this.prisma.audit.findUniqueOrThrow({
        where: { id: auditId },
        include: { website: true, scores: true, schemaAnalyses: true, aeoAnalyses: true },
      }),
      this.prisma.competitor.findUniqueOrThrow({ where: { id: competitorId } }),
    ]);

    if (competitor.targetWebsiteId !== targetAudit.websiteId) {
      throw new NotFoundException('Competitor does not belong to this audit\'s website');
    }

    const hostname = new URL(competitor.url).hostname.toLowerCase();

    let shadowWebsite = await this.prisma.website.findFirst({
      where: { workspaceId: targetAudit.website.workspaceId, url: competitor.url },
    });
    if (!shadowWebsite) {
      shadowWebsite = await this.prisma.website.create({
        data: {
          workspaceId: targetAudit.website.workspaceId,
          url: competitor.url,
          domain: hostname,
          name: competitor.name ?? hostname,
        },
      });
    }

    const crawlJob = await this.crawler.createCrawlJob(shadowWebsite.id, {
      maxPages: COMPETITOR_CRAWL_MAX_PAGES,
    });
    const shadowAudit = await this.prisma.audit.create({
      data: { websiteId: shadowWebsite.id, crawlJobId: crawlJob.id, status: 'CRAWLING', startedAt: new Date() },
    });

    try {
      await this.crawler.runCrawlJob(crawlJob.id);

      await this.prisma.audit.update({ where: { id: shadowAudit.id }, data: { status: 'ANALYZING' } });
      await this.technicalSeoAnalyzer.analyze(shadowAudit.id, crawlJob.id);
      await this.contentAnalyzer.analyze(shadowAudit.id, crawlJob.id);
      await this.entityAnalyzer.analyze(shadowAudit.id, shadowWebsite.id, crawlJob.id);
      await this.schemaAnalyzer.analyze(shadowAudit.id, crawlJob.id);
      await this.aeoAnalyzer.analyze(shadowAudit.id, crawlJob.id);
      await this.geoAnalyzer.analyze(shadowAudit.id);
      await this.scoring.computeScores(shadowAudit.id);

      await this.prisma.audit.update({
        where: { id: shadowAudit.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (err: any) {
      await this.prisma.audit.update({
        where: { id: shadowAudit.id },
        data: { status: 'FAILED', error: err?.message ?? 'Unknown error', completedAt: new Date() },
      });
      throw err;
    }

    await this.writeComparison(targetAudit.id, shadowAudit.id, competitorId);
  }

  private async writeComparison(targetAuditId: string, shadowAuditId: string, competitorId: string) {
    const [targetScores, shadowScores, targetSchemas, shadowSchemas, targetAeo, shadowAeo] = await Promise.all([
      this.prisma.score.findMany({ where: { auditId: targetAuditId } }),
      this.prisma.score.findMany({ where: { auditId: shadowAuditId } }),
      this.prisma.schemaAnalysis.findMany({ where: { auditId: targetAuditId } }),
      this.prisma.schemaAnalysis.findMany({ where: { auditId: shadowAuditId } }),
      this.prisma.aEOAnalysis.findMany({ where: { auditId: targetAuditId } }),
      this.prisma.aEOAnalysis.findMany({ where: { auditId: shadowAuditId } }),
    ]);

    const shadowGeo = await this.prisma.gEOAnalysis.findUnique({ where: { auditId: shadowAuditId } });

    const scoreByCategory = (rows: typeof targetScores) =>
      new Map(rows.map((r) => [r.category, r.normalizedScore]));
    const shadowMap = scoreByCategory(shadowScores);

    const categoryScore = (map: Map<string, number>, category: string) => map.get(category) ?? 0;

    const avg = (nums: number[]) => (nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length);

    const shadowQuestionCoverage = avg(shadowAeo.map((a) => a.questionCoverageScore));
    const targetQuestionCoverage = avg(targetAeo.map((a) => a.questionCoverageScore));

    // Gap 1: schema types the competitor has that the target lacks.
    const targetSchemaTypes = new Set(targetSchemas.filter((s) => s.isValid).map((s) => s.schemaType));
    const shadowSchemaTypes = new Set(shadowSchemas.filter((s) => s.isValid).map((s) => s.schemaType));
    const missingSchemaTypes = [...shadowSchemaTypes].filter((t) => !targetSchemaTypes.has(t));

    // Gap 2: questions the competitor answers directly that the target doesn't
    // (matched by loose keyword overlap - a coarse but evidence-grounded heuristic).
    const targetQuestionTexts = targetAeo.flatMap((a) => {
      const details = a.details as { questions?: { question: string; status: string }[] } | null;
      return (details?.questions ?? [])
        .filter((q) => q.status === 'DIRECTLY_ANSWERED')
        .map((q) => q.question.toLowerCase());
    });
    const shadowDirectQuestions = shadowAeo.flatMap((a) => {
      const details = a.details as { questions?: { question: string; status: string }[] } | null;
      return (details?.questions ?? [])
        .filter((q) => q.status === 'DIRECTLY_ANSWERED')
        .map((q) => q.question);
    });
    const missingQuestions = shadowDirectQuestions.filter((q) => {
      const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      return !targetQuestionTexts.some((t) => words.some((w) => t.includes(w)));
    });

    const gaps = {
      missingSchemaTypes: missingSchemaTypes.map((type) => ({
        type: 'MISSING_SCHEMA',
        schemaType: type,
        evidence: `Competitor has valid ${type} structured data; target has none.`,
      })),
      missingQuestions: missingQuestions.slice(0, 10).map((q) => ({
        type: 'MISSING_ANSWER',
        question: q,
        evidence: `Competitor directly answers "${q}"; no equivalent answer detected on target.`,
      })),
    };

    await this.prisma.competitorAnalysis.create({
      data: {
        competitorId,
        auditId: targetAuditId,
        technicalSeoScore: categoryScore(shadowMap, 'TECHNICAL_SEO'),
        contentScore: categoryScore(shadowMap, 'CONTENT_QUALITY'),
        questionCoverageScore: shadowQuestionCoverage,
        entityClarityScore: categoryScore(shadowMap, 'ENTITY_SEMANTIC_CLARITY'),
        structuredDataScore: categoryScore(shadowMap, 'STRUCTURED_DATA'),
        internalLinkingScore: categoryScore(shadowMap, 'INTERNAL_LINKING'),
        aeoScore: categoryScore(shadowMap, 'AEO'),
        geoScore: shadowGeo?.overallScore ?? 0,
        citationScore: shadowGeo?.citationReadinessScore ?? 0,
        contentDepthScore: categoryScore(shadowMap, 'CONTENT_QUALITY'),
        gaps,
      },
    });

    this.logger.log(
      `Competitor comparison written: target AEO ${targetQuestionCoverage.toFixed(1)} vs competitor ${shadowQuestionCoverage.toFixed(1)}`,
    );
  }
}
