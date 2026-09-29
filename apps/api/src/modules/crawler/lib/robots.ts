import robotsParser from 'robots-parser';
import { assertUrlIsSafeToFetch } from '../../../common/security/ssrf-guard';
import { fetchViaHttp, HttpFetchOptions } from './http-client';

export interface RobotsInfo {
  /** Raw robots.txt body, or null if none was found/fetchable. */
  content: string | null;
  /** Sitemap: lines declared in robots.txt (absolute URLs). */
  sitemaps: string[];
  isAllowed(url: string, userAgent: string): boolean;
}

const ALLOW_ALL: RobotsInfo = {
  content: null,
  sitemaps: [],
  isAllowed: () => true,
};

/**
 * Pure parsing step - no network. Exposed separately so it can be unit
 * tested by constructing `robots-parser` directly from a fixed robots.txt
 * string, per the testing requirements (spec section 21).
 */
export function parseRobotsTxt(baseUrl: string, content: string): RobotsInfo {
  const robots = robotsParser(baseUrl, content);
  return {
    content,
    sitemaps: robots.getSitemaps() ?? [],
    // robots-parser returns `undefined` for URLs it can't classify either
    // way; treat that as "allowed" (fail open on ambiguity, never fail
    // closed and silently skip crawling a whole site over a parser quirk).
    isAllowed: (url: string, ua: string) => robots.isAllowed(url, ua) !== false,
  };
}

/**
 * Fetches and parses {origin}/robots.txt. A missing/broken/blocked
 * robots.txt degrades to "allow everything, no sitemaps declared" - it must
 * never abort the crawl (spec section 5, item 10: "Respect robots.txt
 * *where applicable*").
 */
export async function fetchRobots(siteUrl: string, options: HttpFetchOptions): Promise<RobotsInfo> {
  let robotsUrl: string;
  try {
    robotsUrl = new URL('/robots.txt', siteUrl).toString();
  } catch {
    return ALLOW_ALL;
  }

  try {
    await assertUrlIsSafeToFetch(robotsUrl);
    const response = await fetchViaHttp(robotsUrl, options);
    if (response.statusCode >= 400 || !response.body.trim()) {
      return ALLOW_ALL;
    }
    return parseRobotsTxt(robotsUrl, response.body);
  } catch {
    return ALLOW_ALL;
  }
}
