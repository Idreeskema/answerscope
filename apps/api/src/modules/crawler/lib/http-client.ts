import { assertUrlIsSafeToFetch } from '../../../common/security/ssrf-guard';

/**
 * Thin wrapper around Node 22's built-in global `fetch`. Deliberately does
 * NOT use fetch's automatic redirect following: redirects are walked one hop
 * at a time so `assertUrlIsSafeToFetch` can be (re-)run against the *actual*
 * next hop before it is ever requested (spec section 19: "Re-check every
 * redirect destination"). This is exported as a plain function (not a class)
 * so callers/tests can `jest.mock('./http-client')` directly.
 */

export interface HttpFetchOptions {
  timeoutMs: number;
  userAgent: string;
  maxRedirects?: number;
  accept?: string;
}

export interface HttpFetchResult {
  requestedUrl: string;
  finalUrl: string;
  /** The original URL, if one or more redirects were followed; otherwise null. */
  redirectedFrom: string | null;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  fetchTimeMs: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

export async function fetchViaHttp(rawUrl: string, options: HttpFetchOptions): Promise<HttpFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const start = Date.now();
  let currentUrl = rawUrl;
  let redirectedFrom: string | null = null;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // SSRF gate: run on the original URL AND on every redirect target below -
    // never skip this, even on the very first hop.
    await assertUrlIsSafeToFetch(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': options.userAgent,
          Accept: options.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, currentUrl).toString();
        redirectedFrom = redirectedFrom ?? rawUrl;
        currentUrl = nextUrl;
        continue;
      }
      // Redirect status with no Location header - nothing to follow; treat
      // this response as final rather than erroring out.
    }

    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      requestedUrl: rawUrl,
      finalUrl: currentUrl,
      redirectedFrom,
      statusCode: response.status,
      headers,
      body,
      fetchTimeMs: Date.now() - start,
    };
  }

  throw new Error(`Too many redirects (> ${maxRedirects}) starting at ${rawUrl}`);
}
