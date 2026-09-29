export interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  timeoutMs: number;
  userAgent: string;
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxPages: 100,
  maxDepth: 4,
  concurrency: 4,
  timeoutMs: 15000,
  userAgent: 'AISearchReadinessBot/1.0 (+https://example.com/bot)',
};

export interface ExtractedHeading {
  level: number;
  text: string;
}

export interface ExtractedImage {
  src: string;
  alt: string | null;
}

export interface ExtractedLink {
  href: string;
  anchorText: string | null;
  isInternal: boolean;
}

export interface ExtractedPage {
  url: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  statusCode: number | null;
  redirectedFrom: string | null;
  isIndexable: boolean;
  robotsMeta: string | null;
  title: string | null;
  metaDescription: string | null;
  headings: ExtractedHeading[];
  contentText: string;
  wordCount: number;
  language: string | null;
  ogData: Record<string, string> | null;
  twitterData: Record<string, string> | null;
  jsonLd: unknown[];
  images: ExtractedImage[];
  links: ExtractedLink[];
  fetchTimeMs: number;
}
