import type { Browser } from 'playwright';
import { assertUrlIsSafeToFetch } from '../../../common/security/ssrf-guard';

/**
 * Playwright-based rendering for JS-heavy pages (spec section 5, item 11).
 *
 * This is only ever a *fallback*: the plain HTTP+Cheerio path always runs
 * first and its result is always usable on its own. Rendering is only
 * attempted when that result looks like an empty client-side-rendered shell
 * (see `looksLikeJsRenderedShell` in ./html-extractor), and every function
 * here fails soft - if Chromium isn't installed, can't launch, or the page
 * errors out, callers get `null` back and fall through to the plain-HTTP
 * extraction that was already computed. Playwright's absence (or failure)
 * must never crash or abort a crawl.
 *
 * SSRF safety: the browser is not simply pointed at a URL and trusted. Every
 * request the page makes - the initial navigation, every redirect hop
 * Chromium follows internally, and every subresource (scripts, XHR, etc.) -
 * is intercepted via `context.route()` and re-validated with
 * `assertUrlIsSafeToFetch` before being allowed to proceed, exactly like the
 * manual-redirect plain-HTTP client. A page whose own JS tries to navigate
 * or fetch a blocked address gets that request aborted, not followed.
 */

export interface RenderResult {
  html: string;
  statusCode: number | null;
}

let browserPromise: Promise<Browser | null> | null = null;
let warnedUnavailable = false;

function getBrowser(): Promise<Browser | null> {
  if (!browserPromise) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright') as typeof import('playwright');
    browserPromise = chromium.launch({ headless: true }).catch((err: unknown) => {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          `[crawler] Playwright Chromium unavailable - JS-rendered pages will fall back to plain HTTP+Cheerio: ${message}`,
        );
      }
      return null;
    });
  }
  return browserPromise;
}

export async function renderWithPlaywright(
  url: string,
  options: { timeoutMs: number; userAgent: string },
): Promise<RenderResult | null> {
  try {
    const browser = await getBrowser();
    if (!browser) return null;

    const context = await browser.newContext({ userAgent: options.userAgent });
    try {
      await context.route('**/*', async (route) => {
        try {
          await assertUrlIsSafeToFetch(route.request().url());
          await route.continue();
        } catch {
          await route.abort('blockedbyclient').catch(() => undefined);
        }
      });

      const page = await context.newPage();
      const response = await page.goto(url, {
        timeout: options.timeoutMs,
        waitUntil: 'networkidle',
      });
      const html = await page.content();
      return { html, statusCode: response?.status() ?? null };
    } finally {
      await context.close().catch(() => undefined);
    }
  } catch {
    // Navigation error, timeout, blocked-by-SSRF-guard, etc. - the caller
    // already has a usable plain-HTTP result to fall back to.
    return null;
  }
}

/** Closes the shared browser instance, if one was ever launched. Intended for app shutdown. */
export async function closePlaywrightBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser?.close().catch(() => undefined);
  browserPromise = null;
}
