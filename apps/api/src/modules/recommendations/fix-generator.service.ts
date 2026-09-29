import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityType } from '@prisma/client';
import { generateFixContent } from './fix-generator.helpers';
import { parseAeoQuestions } from './recommendation-engine.helpers';

/**
 * Implements Milestone 10 / spec section 13 (Automatic Fix Generator).
 *
 * generateFix(recommendationId) loads the Recommendation, its audit's real
 * Entity/Page rows, and (when applicable) the affected Page's AEOAnalysis
 * questions, then produces a concrete `after` value grounded in that real
 * data via generateFixContent (fix-generator.helpers.ts - pure functions,
 * unit-tested independently). It always writes a GeneratedFix with status
 * GENERATED - never APPLIED (spec section 13: "Never automatically modify
 * a customer's website without explicit user authorization"; the reviewer
 * approves/rejects via PATCH /recommendations/fixes/:fixId, already wired
 * up in recommendations.controller.ts).
 */
@Injectable()
export class FixGeneratorService {
  private readonly logger = new Logger(FixGeneratorService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateFix(recommendationId: string) {
    const recommendation = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: { audit: true },
    });
    if (!recommendation) throw new NotFoundException('Recommendation not found');

    const auditId = recommendation.auditId;
    const audit = recommendation.audit;

    const [entities, page] = await Promise.all([
      this.prisma.entity.findMany({ where: { auditId } }),
      recommendation.affectedUrl && audit.crawlJobId
        ? this.prisma.page.findFirst({
            where: {
              crawlJobId: audit.crawlJobId,
              OR: [{ url: recommendation.affectedUrl }, { normalizedUrl: recommendation.affectedUrl }],
            },
          })
        : Promise.resolve(null),
    ]);

    const website = await this.prisma.website.findUniqueOrThrow({ where: { id: audit.websiteId } });

    const primaryEntity = pickPrimaryEntityForFix(entities, website);

    let aeoQuestions: string[] = [];
    let internalLinkTarget: { url: string; title: string | null } | null = null;

    if (page) {
      if (recommendation.implementationType === 'FAQ' || recommendation.implementationType === 'ANSWER_SECTION') {
        const aeoAnalysis = await this.prisma.aEOAnalysis.findUnique({ where: { pageId: page.id } });
        if (aeoAnalysis) {
          aeoQuestions = parseAeoQuestions(aeoAnalysis.details)
            .filter((q) => q.status === 'NOT_ANSWERED' || q.status === 'PARTIALLY_ANSWERED')
            .map((q) => q.question);
        }
      }

      if (recommendation.implementationType === 'INTERNAL_LINK' && audit.crawlJobId) {
        internalLinkTarget = await this.findInternalLinkTarget(audit.crawlJobId, page.id, page.wordCount);
      }
    }

    const { before, after } = generateFixContent({
      implementationType: recommendation.implementationType,
      recommendationTitle: recommendation.title,
      recommendationCategory: recommendation.category,
      recommendationEvidence: recommendation.evidence,
      recommendationAction: recommendation.action,
      entityName: primaryEntity.name,
      entityDescription: primaryEntity.description,
      websiteUrl: website.url,
      page: page
        ? {
            title: page.title,
            metaDescription: page.metaDescription,
            headings: page.headings,
            contentText: page.contentText,
            wordCount: page.wordCount,
            url: page.url,
            existingRawJsonLd: page.jsonLd,
          }
        : null,
      aeoQuestions,
      internalLinkTarget,
    });

    this.logger.log(
      `Generated a ${recommendation.implementationType} fix for recommendation ${recommendationId} (audit ${auditId}).`,
    );

    return this.prisma.generatedFix.create({
      data: {
        recommendationId,
        type: recommendation.implementationType,
        before,
        after,
        status: 'GENERATED',
      },
    });
  }

  /** Picks a real, already-crawled page on the same site with the highest
   * word count (excluding the source page itself) as a plausible internal
   * link target - never a fabricated URL. */
  private async findInternalLinkTarget(
    crawlJobId: string,
    excludePageId: string,
    sourceWordCount: number,
  ): Promise<{ url: string; title: string | null } | null> {
    const candidates = await this.prisma.page.findMany({
      where: { crawlJobId, id: { not: excludePageId }, title: { not: null } },
      orderBy: { wordCount: 'desc' },
      take: 5,
    });
    const best = candidates[0];
    if (!best) return null;
    void sourceWordCount;
    return { url: best.url, title: best.title };
  }
}

function pickPrimaryEntityForFix(
  entities: { name: string; type: EntityType; description: string | null; confidence: number }[],
  website: { domain: string; name: string | null },
): { name: string; description: string | null } {
  const org = entities.find((e) => e.type === EntityType.ORGANIZATION);
  if (org) return { name: org.name, description: org.description };
  const sorted = [...entities].sort((a, b) => b.confidence - a.confidence);
  if (sorted[0]) return { name: sorted[0].name, description: sorted[0].description };
  const host = website.domain.replace(/^www\./i, '').split(':')[0];
  const label = host.split('.')[0];
  const fallbackName = website.name?.trim() || (label ? label.charAt(0).toUpperCase() + label.slice(1) : host);
  return { name: fallbackName, description: null };
}
