import { XMLParser } from 'fast-xml-parser';
import { assertUrlIsSafeToFetch } from '../../../common/security/ssrf-guard';
import { fetchViaHttp, HttpFetchOptions } from './http-client';

const xmlParser = new XMLParser({ ignoreAttributes: true });

// Bounds so a malicious/huge sitemap tree can't make discovery run forever.
const MAX_SITEMAPS_TO_VISIT = 25;
const MAX_URLS = 5000;

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractLoc(entry: unknown): string | null {
  if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).loc === 'string') {
    const loc = (entry as Record<string, unknown>).loc as string;
    return loc.trim() || null;
  }
  return null;
}

/**
 * Fetches and parses sitemap(s) starting from `candidateSitemapUrls`,
 * recursively following <sitemapindex> entries, and returns the flat list of
 * page URLs discovered (spec section 5, items 3-4). Every fetch is
 * SSRF-checked; any single sitemap that fails to fetch/parse is skipped so
 * it doesn't take down discovery for the rest of the tree.
 */
export async function discoverSitemapUrls(
  candidateSitemapUrls: string[],
  options: HttpFetchOptions,
): Promise<string[]> {
  const discovered = new Set<string>();
  const visited = new Set<string>();
  const queue = [...candidateSitemapUrls];

  while (queue.length > 0 && visited.size < MAX_SITEMAPS_TO_VISIT && discovered.size < MAX_URLS) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    try {
      await assertUrlIsSafeToFetch(sitemapUrl);
      const response = await fetchViaHttp(sitemapUrl, options);
      if (response.statusCode >= 400 || !response.body.trim()) continue;

      const parsed = xmlParser.parse(response.body) as Record<string, any>;

      for (const entry of toArray(parsed?.sitemapindex?.sitemap)) {
        const loc = extractLoc(entry);
        if (loc && !visited.has(loc)) queue.push(loc);
      }

      for (const entry of toArray(parsed?.urlset?.url)) {
        const loc = extractLoc(entry);
        if (loc) discovered.add(loc);
        if (discovered.size >= MAX_URLS) break;
      }
    } catch {
      // Skip this sitemap (blocked, unreachable, or malformed XML) and keep
      // going with whatever else is queued.
    }
  }

  return [...discovered];
}
