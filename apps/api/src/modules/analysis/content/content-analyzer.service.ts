import { Injectable, Logger } from '@nestjs/common';
import { Page, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DUPLICATE_CONTENT_MIN_WORDS,
  DUPLICATE_CONTENT_SIMILARITY_THRESHOLD,
  HeadingLike,
  computeAvgSentenceLength,
  countParagraphs,
  extractTopics,
  fleschReadingEase,
  isThinContent,
  jaccardSimilarity,
  normalizeToWordSet,
} from './content-analysis.helpers';

function parseHeadings(raw: unknown): HeadingLike[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({
      level: typeof h.level === 'number' ? h.level : Number(h.level) || 0,
      text: typeof h.text === 'string' ? h.text : '',
    }))
    .filter((h) => h.level > 0);
}

/**
 * Content Analyzer (Milestone 4). Writes one ContentAnalysis row per Page
 * with paragraph/sentence/readability stats, a thin-content flag, a
 * near-duplicate pointer, and a small set of frequency-extracted topics.
 * See content-analysis.helpers.ts for the exact formulas/thresholds used
 * (Flesch Reading Ease, Jaccard word-set similarity, etc) and the rationale
 * documented there. No LLM calls - deterministic only.
 */
@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async analyze(auditId: string, crawlJobId: string): Promise<void> {
    const pages = await this.prisma.page.findMany({ where: { crawlJobId } });
    if (pages.length === 0) {
      this.logger.warn(`No pages found for crawl job ${crawlJobId}; skipping content analysis`);
      return;
    }

    const duplicateOfMap = this.computeDuplicates(pages);

    const rows: Prisma.ContentAnalysisCreateManyInput[] = pages.map((page) => {
      const headings = parseHeadings(page.headings);
      const paragraphCount = countParagraphs(page.contentText);
      const avgSentenceLength = computeAvgSentenceLength(page.contentText);
      const readabilityScore = fleschReadingEase(page.contentText);
      const topics = extractTopics(headings, page.contentText, 8);

      return {
        pageId: page.id,
        auditId,
        paragraphCount,
        avgSentenceLength,
        readabilityScore,
        duplicateOfPageId: duplicateOfMap.get(page.id) ?? null,
        thinContent: isThinContent(page.wordCount),
        topics,
      };
    });

    // ContentAnalysis.pageId is @unique, so re-running analysis for the same
    // audit/crawl job (e.g. a retried pipeline run) must replace, not
    // duplicate, prior rows for these pages.
    await this.prisma.$transaction([
      this.prisma.contentAnalysis.deleteMany({ where: { pageId: { in: pages.map((p) => p.id) } } }),
      this.prisma.contentAnalysis.createMany({ data: rows }),
    ]);

    this.logger.log(`Wrote ${rows.length} ContentAnalysis rows`);
  }

  /**
   * Pairs up near-duplicate pages using the same word-set Jaccard heuristic
   * as the Technical SEO Analyzer's duplicate-content check (see
   * content-analysis.helpers.ts). Pages are compared in a stable order
   * (createdAt/discoveredAt, falling back to id) so that when A and B are
   * near-duplicates, the later one points duplicateOfPageId at the earlier
   * one - never the reverse, and never a mutual/cyclical pointer.
   */
  private computeDuplicates(pages: Page[]): Map<string, string> {
    const ordered = [...pages].sort((a, b) => {
      const at = a.discoveredAt?.getTime() ?? 0;
      const bt = b.discoveredAt?.getTime() ?? 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });

    const eligible = ordered
      .map((p) => ({ page: p, words: normalizeToWordSet(p.contentText) }))
      .filter((p) => p.page.wordCount >= DUPLICATE_CONTENT_MIN_WORDS);

    const duplicateOf = new Map<string, string>();
    const alreadyMatched = new Set<string>();

    for (let i = 0; i < eligible.length; i++) {
      if (alreadyMatched.has(eligible[i].page.id)) continue;
      for (let j = i + 1; j < eligible.length; j++) {
        if (alreadyMatched.has(eligible[j].page.id)) continue;
        const similarity = jaccardSimilarity(eligible[i].words, eligible[j].words);
        if (similarity >= DUPLICATE_CONTENT_SIMILARITY_THRESHOLD) {
          duplicateOf.set(eligible[j].page.id, eligible[i].page.id);
          alreadyMatched.add(eligible[j].page.id);
        }
      }
    }
    return duplicateOf;
  }
}
