import * as cheerio from 'cheerio';
import type { ExtractedHeading, ExtractedImage, ExtractedLink } from '../crawler.types';
import { normalizeHostname, resolveHref } from './url-normalizer';

export interface HtmlExtractionResult {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  headings: ExtractedHeading[];
  /** Open Graph tags, keyed WITHOUT the "og:" prefix (e.g. `title`, `description`, `image`). */
  ogData: Record<string, string> | null;
  /** Twitter Card tags, keyed WITHOUT the "twitter:" prefix. */
  twitterData: Record<string, string> | null;
  jsonLd: unknown[];
  images: ExtractedImage[];
  links: ExtractedLink[];
  contentText: string;
  wordCount: number;
  language: string | null;
}

// Elements stripped before computing visible body text - script/style are
// never "content"; nav/footer/header are treated as site chrome/boilerplate
// rather than page content (spec section 5, item 12: "paragraphs").
const BOILERPLATE_SELECTORS = ['script', 'style', 'noscript', 'nav', 'footer', 'header', 'iframe', 'svg', 'template'];

/**
 * Extracts every signal the spec (section 5, item 12) asks for from a single
 * HTML document using Cheerio. Pure function of (html, pageUrl,
 * websiteHostname) - no I/O, so it is directly unit-testable with fixed HTML
 * strings. Used for both the plain-HTTP path and the Playwright-rendered
 * path (same extraction logic either way).
 */
export function extractHtml(html: string, pageUrl: string, websiteHostname: string): HtmlExtractionResult {
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const robotsMeta = $('meta[name="robots"]').attr('content')?.trim() || null;
  const language = $('html').attr('lang')?.trim() || null;

  const canonicalHref = $('link[rel="canonical"]').attr('href');
  const canonicalUrl = canonicalHref ? resolveHref(canonicalHref, pageUrl)?.toString() ?? null : null;

  const headings: ExtractedHeading[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tagName = (el as unknown as { tagName?: string }).tagName ?? '';
    const level = parseInt(tagName.slice(1), 10);
    if (level >= 1 && level <= 6) {
      headings.push({ level, text: $(el).text().trim() });
    }
  });

  const ogData: Record<string, string> = {};
  $('meta[property]').each((_, el) => {
    const property = $(el).attr('property');
    const content = $(el).attr('content');
    if (property && content !== undefined && property.toLowerCase().startsWith('og:')) {
      ogData[property.slice('og:'.length)] = content;
    }
  });

  const twitterData: Record<string, string> = {};
  $('meta[name]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content !== undefined && name.toLowerCase().startsWith('twitter:')) {
      twitterData[name.slice('twitter:'.length)] = content;
    }
  });

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else jsonLd.push(parsed);
    } catch {
      // Malformed JSON-LD block on this page - skip it, never crash
      // extraction for the whole page over one bad <script> tag.
    }
  });

  const images: ExtractedImage[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const resolved = resolveHref(src, pageUrl);
    images.push({ src: resolved ? resolved.toString() : src, alt: $(el).attr('alt') ?? null });
  });

  const normalizedWebsiteHost = normalizeHostname(websiteHostname);
  const links: ExtractedLink[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const resolved = resolveHref(href, pageUrl);
    if (!resolved) return;
    const anchorText = $(el).text().trim() || null;
    const isInternal = normalizeHostname(resolved.hostname) === normalizedWebsiteHost;
    links.push({ href: resolved.toString(), anchorText, isInternal });
  });

  const $content = $.root().clone();
  $content.find([...BOILERPLATE_SELECTORS, 'head'].join(',')).remove();
  const contentText = $content
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = contentText ? contentText.split(' ').filter(Boolean).length : 0;

  return {
    title,
    metaDescription,
    canonicalUrl,
    robotsMeta,
    headings,
    ogData: Object.keys(ogData).length ? ogData : null,
    twitterData: Object.keys(twitterData).length ? twitterData : null,
    jsonLd,
    images,
    links,
    contentText,
    wordCount,
    language,
  };
}

/** Combines the <meta name="robots"> tag and X-Robots-Tag response header. */
export function hasNoIndexDirective(robotsMeta: string | null, xRobotsTagHeader?: string | null): boolean {
  const combined = `${robotsMeta ?? ''} ${xRobotsTagHeader ?? ''}`.toLowerCase();
  return combined.includes('noindex');
}

/**
 * Heuristic used to decide whether a plain-HTTP fetch likely missed
 * client-side-rendered content and a Playwright re-render is worth trying:
 * a document with a substantial amount of raw HTML but almost no extracted
 * body text is the classic signature of a JS-only SPA shell (e.g. a bare
 * `<div id="root"></div>` plus a pile of <script> bundles).
 */
export function looksLikeJsRenderedShell(extraction: HtmlExtractionResult, rawHtmlLength: number): boolean {
  return extraction.wordCount < 40 && rawHtmlLength > 200;
}
