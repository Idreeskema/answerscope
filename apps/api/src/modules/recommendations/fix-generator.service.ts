import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * STUB - implements Milestone 10 / spec section 13 (Automatic Fix
 * Generator). generateFix(recommendationId) must load the Recommendation
 * (+ its affected Page via affectedUrl) and produce a concrete `after` value
 * matching its implementationType using deterministic templates grounded in
 * real page content (title/headings/entities) - e.g. META_TITLE: rewrite
 * Page.title within ~50-60 chars including the primary entity; JSON_LD:
 * emit a valid schema.org block for the missing schema type using data
 * already extracted (Entity, Page.title, website domain); FAQ: derive
 * Q/A pairs from AEOAnalysis.details NOT_ANSWERED questions.
 * Write a GeneratedFix row with status GENERATED - it must never be marked
 * APPLIED automatically (spec section 13: "Never automatically modify a
 * customer's website without explicit user authorization"); a user reviews
 * and approves/rejects it via PATCH /recommendations/fixes/:fixId.
 */
@Injectable()
export class FixGeneratorService {
  private readonly logger = new Logger(FixGeneratorService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generateFix(recommendationId: string) {
    this.logger.warn(`FixGeneratorService.generateFix is a STUB (recommendation ${recommendationId})`);
    const recommendation = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
    });
    if (!recommendation) throw new NotFoundException('Recommendation not found');

    return this.prisma.generatedFix.create({
      data: {
        recommendationId,
        type: recommendation.implementationType,
        before: null,
        after: 'Fix generation not yet implemented (stub)',
        status: 'GENERATED',
      },
    });
  }
}
