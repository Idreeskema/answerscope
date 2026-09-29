import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GEO_SCORE_WEIGHTS,
  computeCitationReadiness,
  computeContentQuality,
  computeEntityClarity,
  computeMachineReadability,
  computeTopicalCoverage,
} from './geo-heuristics';

/**
 * Implements Milestone 5 / spec section 8 (GEO / AI Search Readiness
 * Analyzer). Runs after the technical-seo/content/entity/schema/aeo
 * analyzers and aggregates their output ACROSS THE WHOLE WEBSITE for this
 * audit (one GEOAnalysis row per audit, not per page). See
 * ./geo-heuristics.ts for the pure, independently-unit-tested scoring
 * logic; this file only gathers the Prisma rows and wires them together.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class GeoAnalyzerService {
  private readonly logger = new Logger(GeoAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string): Promise<void> {
    const audit = await this.prisma.audit.findUniqueOrThrow({ where: { id: auditId } });

    const [entities, contentAnalyses, schemaAnalyses, aeoAnalyses, pages] = await Promise.all([
      this.prisma.entity.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.contentAnalysis.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.schemaAnalysis.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      this.prisma.aEOAnalysis.findMany({ where: { auditId }, orderBy: { id: 'asc' } }),
      audit.crawlJobId
        ? this.prisma.page.findMany({ where: { crawlJobId: audit.crawlJobId }, orderBy: { id: 'asc' } })
        : Promise.resolve([]),
    ]);

    if (pages.length === 0) {
      this.logger.warn(`GeoAnalyzerService.analyze: no pages found for audit ${auditId}`);
    }

    const pageIds = pages.map((p) => p.id);
    const externalLinks =
      pageIds.length > 0
        ? await this.prisma.pageLink.findMany({
            where: { sourcePageId: { in: pageIds }, isInternal: false },
            orderBy: { id: 'asc' },
          })
        : [];

    const entityClarity = computeEntityClarity(entities);
    const topicalCoverage = computeTopicalCoverage(contentAnalyses, pages);
    const contentQuality = computeContentQuality(pages, externalLinks.length);
    const machineReadability = computeMachineReadability(pages, schemaAnalyses, aeoAnalyses);
    const citationReadiness = computeCitationReadiness(pages, externalLinks.length);

    const overallScore = round2(
      entityClarity.score * GEO_SCORE_WEIGHTS.entityClarity +
        topicalCoverage.score * GEO_SCORE_WEIGHTS.topicalCoverage +
        contentQuality.score * GEO_SCORE_WEIGHTS.contentQuality +
        machineReadability.score * GEO_SCORE_WEIGHTS.machineReadability +
        citationReadiness.score * GEO_SCORE_WEIGHTS.citationReadiness,
    );

    const details: Prisma.InputJsonValue = {
      summary: `AI Search Readiness: ${overallScore}/100`,
      disclaimer:
        'This score reflects measurable, deterministic website characteristics (entity clarity, topical coverage, content quality signals, machine readability, and citation readiness). It does not predict or guarantee citation, ranking, or recommendation by ChatGPT, Gemini, Claude, Perplexity, Google AI Overviews, or any other specific AI or search system.',
      factors: [
        {
          name: 'Entity Clarity',
          score: entityClarity.score,
          weight: GEO_SCORE_WEIGHTS.entityClarity,
          evidence: entityClarity.evidence,
        },
        {
          name: 'Topical Coverage',
          score: topicalCoverage.score,
          weight: GEO_SCORE_WEIGHTS.topicalCoverage,
          evidence: topicalCoverage.evidence,
        },
        {
          name: 'Content Quality',
          score: contentQuality.score,
          weight: GEO_SCORE_WEIGHTS.contentQuality,
          evidence: contentQuality.evidence,
        },
        {
          name: 'Machine Readability',
          score: machineReadability.score,
          weight: GEO_SCORE_WEIGHTS.machineReadability,
          evidence: machineReadability.evidence,
        },
        {
          name: 'Citation Readiness',
          score: citationReadiness.score,
          weight: GEO_SCORE_WEIGHTS.citationReadiness,
          evidence: citationReadiness.evidence,
        },
      ],
      pagesAnalyzed: pages.length,
    };

    await this.prisma.gEOAnalysis.upsert({
      where: { auditId },
      create: {
        auditId,
        entityClarityScore: entityClarity.score,
        topicalCoverageScore: topicalCoverage.score,
        contentQualityScore: contentQuality.score,
        machineReadabilityScore: machineReadability.score,
        citationReadinessScore: citationReadiness.score,
        overallScore,
        details,
      },
      update: {
        entityClarityScore: entityClarity.score,
        topicalCoverageScore: topicalCoverage.score,
        contentQualityScore: contentQuality.score,
        machineReadabilityScore: machineReadability.score,
        citationReadinessScore: citationReadiness.score,
        overallScore,
        details,
      },
    });

    this.logger.log(`GEO analysis complete for audit ${auditId}: overall ${overallScore}/100`);
  }
}
