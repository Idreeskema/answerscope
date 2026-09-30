import { Logger } from '@nestjs/common';
import { FixGenerationContext } from '../fix-generator.helpers';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 20000;

/** Implementation types where LLM-polished prose is a genuine improvement
 * over the mechanical template. JSON_LD and INTERNAL_LINK are deliberately
 * excluded - they need strict structural correctness (valid schema.org
 * JSON, a real crawled target URL), where the deterministic generator is
 * more reliable than an LLM guessing at structure. */
const LLM_ELIGIBLE_TYPES = new Set([
  'META_TITLE',
  'META_DESCRIPTION',
  'FAQ',
  'ANSWER_SECTION',
  'CONTENT_UPDATE',
  'PAGE_OUTLINE',
]);

const SYSTEM_PROMPT = `You are an SEO/AEO copywriting assistant embedded in a website-audit product.
You are given real, extracted facts about one specific webpage from a real crawl, the specific fix
task, and a mechanically-generated draft. Rewrite the draft into more natural, polished copy while
strictly obeying these rules:
1. Stay within any length/format constraint given.
2. Never invent a fact, statistic, price, date, name, or claim that is not present in the input. If
   the input doesn't contain enough information to improve on the draft, return the draft close to
   unchanged rather than inventing specifics.
3. Preserve any "[NEEDS INPUT]" marker from the draft if the underlying gap is still unfilled -
   do not remove it just to sound complete.
4. Output ONLY the final content itself - no preamble, no explanation, no markdown code fences, no
   surrounding quotation marks.`;

export function isLlmEligible(implementationType: string): boolean {
  return LLM_ELIGIBLE_TYPES.has(implementationType);
}

function truncate(text: string | null, max: number): string {
  if (!text) return '(none)';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function buildUserPrompt(ctx: FixGenerationContext, draftAfter: string): string {
  const lines: string[] = [];
  lines.push(`Fix type: ${ctx.implementationType}`);
  lines.push(`Problem: ${ctx.recommendationTitle}`);
  lines.push(`Evidence: ${ctx.recommendationEvidence}`);
  lines.push(`Action requested: ${ctx.recommendationAction}`);
  lines.push(`Entity/brand name: ${ctx.entityName}`);
  if (ctx.entityDescription) lines.push(`Entity description: ${truncate(ctx.entityDescription, 300)}`);
  if (ctx.page) {
    lines.push(`Page URL: ${ctx.page.url}`);
    lines.push(`Page title: ${ctx.page.title ?? '(none)'}`);
    lines.push(`Page meta description: ${ctx.page.metaDescription ?? '(none)'}`);
    lines.push(`Page content excerpt: ${truncate(ctx.page.contentText, 1200)}`);
  }
  if (ctx.aeoQuestions.length > 0) {
    lines.push(`Unanswered questions on this page: ${ctx.aeoQuestions.join(' | ')}`);
  }
  lines.push('');
  lines.push(`Mechanically-generated draft to improve on:\n${draftAfter}`);
  lines.push('');

  switch (ctx.implementationType) {
    case 'META_TITLE':
      lines.push('Return an improved meta title only, 30-60 characters, including the entity name.');
      break;
    case 'META_DESCRIPTION':
      lines.push('Return an improved meta description only, ideally 140-160 characters.');
      break;
    case 'FAQ':
      lines.push(
        'Return improved FAQ content as a JSON array of {question, answer, needsInput} objects, ' +
          'matching the draft\'s structure - one object per question, in the same order.',
      );
      break;
    case 'ANSWER_SECTION':
      lines.push('Return an improved "Q: ...\\nA: ..." answer section only, in the same format as the draft.');
      break;
    case 'CONTENT_UPDATE':
      lines.push(
        'Return a short draft paragraph (3-5 sentences) the page owner could adapt, prefixed with ' +
          '"[DRAFT - verify facts]" since it may need real facts (pricing, specifics) filled in.',
      );
      break;
    case 'PAGE_OUTLINE':
      lines.push('Return an improved heading outline in the same "H#: text" line format as the draft.');
      break;
    default:
      lines.push('Return improved content in the same format as the draft.');
  }

  return lines.join('\n');
}

/**
 * Real LLM-backed enhancement of the Automatic Fix Generator's `after`
 * content (spec section 13's "AI-generated fixes"). Always seeded with a
 * safe, deterministic draft (see fix-generator.helpers.ts) so a failed or
 * low-quality LLM call never produces something worse than the fallback -
 * the caller keeps the deterministic result whenever this returns null.
 */
export class OpenAiFixContentProvider {
  private readonly logger = new Logger(OpenAiFixContentProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async generate(ctx: FixGenerationContext, draftAfter: string): Promise<string | null> {
    if (!isLlmEligible(ctx.implementationType)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(ctx, draftAfter) },
          ],
          temperature: 0.4,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(`OpenAI fix-content generation failed: ${response.status} ${text.slice(0, 300)}`);
        return null;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      return typeof content === 'string' && content.trim() ? content.trim() : null;
    } catch (err) {
      this.logger.warn(
        `OpenAI fix-content generation error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
