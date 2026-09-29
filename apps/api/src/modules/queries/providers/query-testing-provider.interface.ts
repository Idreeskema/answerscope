/**
 * Provider abstraction for Milestone 7 / spec section 10 (AI / Search Query
 * Testing). Real providers call official APIs (OpenAI, Anthropic, Google AI
 * Overviews, Perplexity, ...) and MUST be added as separate classes
 * implementing this interface, gated behind an API key in .env. Never scrape
 * a service in violation of its terms (spec section 10).
 *
 * `NullQueryTestingProvider` is registered whenever no key is configured and
 * always returns status "NOT_CONFIGURED" - the product must never fabricate
 * a result and present it as an observed one (spec section 3 / 26).
 */
export type QueryTestingProviderName =
  | 'OPENAI'
  | 'ANTHROPIC'
  | 'PERPLEXITY'
  | 'GOOGLE_AI_OVERVIEWS';

export interface QueryTestingResult {
  status: 'OK' | 'NOT_CONFIGURED' | 'ERROR';
  provider: string;
  targetMentioned: boolean | null;
  targetCited: boolean | null;
  citedUrls: string[];
  competingBrands: string[];
  competingUrls: string[];
  answerSummary: string | null;
  citationPosition: number | null;
  providerMetadata: Record<string, unknown>;
  errorMessage?: string;
}

export interface QueryTestingProvider {
  readonly name: QueryTestingProviderName;
  isConfigured(): boolean;
  test(query: string, targetDomain: string): Promise<QueryTestingResult>;
}
