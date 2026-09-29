import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AEO_SCORE_WEIGHTS,
  Heading,
  QuestionContext,
  computeContentStructureScore,
  computeEntityClarityScore,
  computeFaqCoverageScore,
  computeStructuredDataScore,
  evaluateAnswer,
  generateQuestions,
  isHomepagePath,
} from './aeo-heuristics';

/**
 * Implements Milestone 5 / spec section 7 (AEO Analyzer).
 *
 * For a capped set of "important" pages (homepage + highest word-count
 * pages) we deterministically generate likely user questions from the
 * page's title/headings/URL/entity context, decide DIRECTLY_ANSWERED /
 * PARTIALLY_ANSWERED / NOT_ANSWERED per question using text-proximity
 * heuristics against Page.contentText, and persist one AEOAnalysis row per
 * page. See ./aeo-heuristics.ts for the pure, independently-unit-tested
 * logic; this file only wires it to Prisma.
 */

// Homepage + up to this many additional highest-word-count pages.
const MAX_IMPORTANT_PAGES = 18;

function asHeadings(json: Prisma.JsonValue | null): Heading[] {
  if (!Array.isArray(json)) return [];
  return (json as unknown[])
    .filter((h) => !!h && typeof h === 'object' && !Array.isArray(h))
    .map((h) => ({ level: Number((h as any).level) || 0, text: String((h as any).text ?? '') }))
    .filter((h) => h.text.trim().length > 0);
}

function asJsonLdArray(json: Prisma.JsonValue | null): unknown[] {
  return Array.isArray(json) ? json : [];
}

function hasFaqJsonLd(jsonLd: unknown[]): boolean {
  return jsonLd.some((block) => JSON.stringify(block).includes('FAQPage'));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class AeoAnalyzerService {
  private readonly logger = new Logger(AeoAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, crawlJobId: string): Promise<void> {
    const pages = await this.prisma.page.findMany({
      where: { crawlJobId },
      orderBy: [{ wordCount: 'desc' }, { url: 'asc' }],
    });

    if (pages.length === 0) {
      this.logger.warn(
        `AeoAnalyzerService.analyze: no pages found for crawl job ${crawlJobId} (audit ${auditId}) - skipping`,
      );
      return;
    }

    const homepage = pages.find((p) => isHomepagePath(p.url)) ?? null;
    const rest = pages.filter((p) => p.id !== homepage?.id);
    const importantPages = homepage
      ? [homepage, ...rest.slice(0, MAX_IMPORTANT_PAGES - 1)]
      : pages.slice(0, MAX_IMPORTANT_PAGES);

    // Prefer a real Organization entity name (from the Entity Analyzer) for
    // question wording; fall back to the site's hostname, never a fabricated name.
    const orgEntities = await this.prisma.entity.findMany({
      where: { auditId, type: 'ORGANIZATION' },
      orderBy: [{ confidence: 'desc' }, { id: 'asc' }],
    });

    let siteName = orgEntities[0]?.name?.trim() ?? '';
    if (!siteName) {
      try {
        siteName = new URL(pages[0].url).hostname.replace(/^www\./, '');
      } catch {
        siteName = 'This website';
      }
    }

    for (const page of importantPages) {
      const headings = asHeadings(page.headings);
      const jsonLd = asJsonLdArray(page.jsonLd);
      const faqJsonLd = hasFaqJsonLd(jsonLd);

      const ctx: QuestionContext = {
        siteName,
        title: page.title,
        url: page.url,
        headings,
        hasFaqJsonLd: faqJsonLd,
        isHomepage: page.id === homepage?.id,
      };

      const questions = generateQuestions(ctx);
      const questionResults = questions.map((question) => {
        const evalResult = evaluateAnswer(question, page.contentText, page.wordCount);
        return { question, ...evalResult };
      });

      const total = questionResults.length;
      const directCount = questionResults.filter((q) => q.status === 'DIRECTLY_ANSWERED').length;
      const answeredCount = questionResults.filter((q) => q.status !== 'NOT_ANSWERED').length;

      const questionCoverageScore = total > 0 ? round2((answeredCount / total) * 100) : 0;
      const answerDirectnessScore = total > 0 ? round2((directCount / total) * 100) : 0;
      const contentStructureScore = round2(computeContentStructureScore(headings, page.contentText));
      const faqCoverageScore = round2(computeFaqCoverageScore(headings, faqJsonLd));

      const pageEntities = await this.prisma.entity.findMany({
        where: { sourcePageId: page.id },
        orderBy: { id: 'asc' },
      });
      const entityClarityScore = round2(computeEntityClarityScore(pageEntities));

      const schemaRows = await this.prisma.schemaAnalysis.findMany({
        where: { pageId: page.id },
        orderBy: { id: 'asc' },
      });
      const structuredDataScore = round2(computeStructuredDataScore(schemaRows, jsonLd.length));

      const overallScore = round2(
        questionCoverageScore * AEO_SCORE_WEIGHTS.questionCoverage +
          answerDirectnessScore * AEO_SCORE_WEIGHTS.answerDirectness +
          contentStructureScore * AEO_SCORE_WEIGHTS.contentStructure +
          faqCoverageScore * AEO_SCORE_WEIGHTS.faqCoverage +
          entityClarityScore * AEO_SCORE_WEIGHTS.entityClarity +
          structuredDataScore * AEO_SCORE_WEIGHTS.structuredData,
      );

      const details: Prisma.InputJsonValue = {
        questions: questionResults,
        scoringWeights: AEO_SCORE_WEIGHTS,
      };

      await this.prisma.aEOAnalysis.upsert({
        where: { pageId: page.id },
        create: {
          auditId,
          pageId: page.id,
          questionCoverageScore,
          answerDirectnessScore,
          contentStructureScore,
          faqCoverageScore,
          entityClarityScore,
          structuredDataScore,
          overallScore,
          details,
        },
        update: {
          auditId,
          questionCoverageScore,
          answerDirectnessScore,
          contentStructureScore,
          faqCoverageScore,
          entityClarityScore,
          structuredDataScore,
          overallScore,
          details,
        },
      });
    }

    this.logger.log(`AEO analysis complete for audit ${auditId}: ${importantPages.length} page(s) analyzed`);
  }
}
