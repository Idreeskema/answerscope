import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AeoAnalysisLike,
  SchemaAnalysisLike,
  SeoCheckLike,
  buildOrganizationSchemaGapRecommendation,
  buildRecommendationsFromAeoAnalyses,
  buildRecommendationsFromGeoAnalysis,
  buildRecommendationsFromSchemaAnalyses,
  buildRecommendationsFromSeoChecks,
} from './recommendation-engine.helpers';

/**
 * Implements Milestone 9 / spec section 12 (Recommendation Engine).
 *
 * generateRecommendations(auditId) reads every real finding already
 * persisted for this audit - failing/warning SEOCheck rows, NOT_ANSWERED/
 * PARTIALLY_ANSWERED entries in AEOAnalysis.details.questions, named gaps
 * in GEOAnalysis.details, and invalid/missing SchemaAnalysis rows - and
 * turns each *distinct* one into a Recommendation row. All scoring
 * (impact/effort/confidence/priority) and dedup/aggregation logic lives in
 * recommendation-engine.helpers.ts (pure functions, unit-tested
 * independently); this service is the Prisma I/O wrapper around them.
 *
 * Per spec section 12 ("Do not create arbitrary recommendations") and
 * docs/AGENT_BRIEF.md's "no mock data" principle: a Recommendation is only
 * ever created from a real underlying row already in Postgres. If a given
 * source has nothing to report (e.g. no SEOCheck rows yet because the
 * technical SEO analyzer hasn't run), that source simply contributes zero
 * recommendations rather than a placeholder.
 */
@Injectable()
export class RecommendationEngineService {
  private readonly logger = new Logger(RecommendationEngineService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateRecommendations(auditId: string): Promise<void> {
    const audit = await this.prisma.audit.findUniqueOrThrow({ where: { id: auditId } });

    const [failingChecks, aeoAnalyses, geoAnalysis, schemaAnalyses] = await Promise.all([
      this.prisma.sEOCheck.findMany({
        where: { auditId, status: { in: ['FAIL', 'WARNING'] } },
        include: { page: true },
      }),
      this.prisma.aEOAnalysis.findMany({ where: { auditId }, include: { page: true } }),
      this.prisma.gEOAnalysis.findUnique({ where: { auditId } }),
      this.prisma.schemaAnalysis.findMany({ where: { auditId }, include: { page: true } }),
    ]);
    const pages = audit.crawlJobId
      ? await this.prisma.page.findMany({ where: { crawlJobId: audit.crawlJobId } })
      : [];

    const seoCheckInputs: SeoCheckLike[] = failingChecks.map((c) => ({
      id: c.id,
      pageId: c.pageId,
      checkId: c.checkId,
      category: c.category,
      status: c.status,
      severity: c.severity,
      evidence: c.evidence,
      recommendation: c.recommendation,
      pageUrl: c.page?.url ?? null,
    }));

    const aeoInputs: AeoAnalysisLike[] = aeoAnalyses.map((a) => ({
      id: a.id,
      pageId: a.pageId,
      pageUrl: a.page?.url ?? null,
      details: a.details,
    }));

    const schemaInputs: SchemaAnalysisLike[] = schemaAnalyses.map((s) => ({
      id: s.id,
      pageId: s.pageId,
      pageUrl: s.page?.url ?? null,
      schemaType: s.schemaType,
      isValid: s.isValid,
      errors: s.errors,
    }));

    const recommendations = [
      ...buildRecommendationsFromSeoChecks(seoCheckInputs),
      ...buildRecommendationsFromAeoAnalyses(aeoInputs),
      ...buildRecommendationsFromGeoAnalysis(geoAnalysis?.details ?? null),
      ...buildRecommendationsFromSchemaAnalyses(schemaInputs),
    ];

    // Spec section 12's own worked example: flag a sitewide missing
    // Organization schema, but only when we actually have a crawled page to
    // point the fix at (otherwise there's no real evidence to cite).
    const homepage = pages.find((p) => {
      try {
        return new URL(p.normalizedUrl || p.url).pathname === '/';
      } catch {
        return false;
      }
    });
    if (homepage) {
      const hasValidOrganizationSchema = schemaAnalyses.some(
        (s) => s.isValid && s.schemaType.toLowerCase() === 'organization',
      );
      if (!hasValidOrganizationSchema) {
        const schemaTypesFound = [...new Set(schemaAnalyses.map((s) => s.schemaType))];
        recommendations.push(buildOrganizationSchemaGapRecommendation(homepage.url, schemaTypesFound));
      }
    }

    if (recommendations.length === 0) {
      this.logger.warn(`No real findings to convert into recommendations for audit ${auditId}.`);
      return;
    }

    await this.prisma.recommendation.createMany({
      data: recommendations.map((r) => ({
        auditId,
        title: r.title,
        category: r.category,
        severity: r.severity,
        impact: r.impact,
        effort: r.effort,
        confidence: r.confidence,
        priority: r.priority,
        evidence: r.evidence,
        explanation: r.explanation,
        action: r.action,
        example: r.example,
        affectedUrl: r.affectedUrl,
        implementationType: r.implementationType,
      })),
    });

    this.logger.log(`Generated ${recommendations.length} recommendations for audit ${auditId}.`);
  }
}
