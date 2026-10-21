import { Logger } from '@nestjs/common';
import {
  QueryTestingProvider,
  QueryTestingProviderName,
  QueryTestingResult,
} from './query-testing-provider.interface';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o';
const REQUEST_TIMEOUT_MS = 25000;

interface ResponsesApiAnnotation {
  type: string;
  url?: string;
  title?: string;
}

interface ResponsesApiContentPart {
  type: string;
  text?: string;
  annotations?: ResponsesApiAnnotation[];
}

interface ResponsesApiOutputItem {
  type: string;
  content?: ResponsesApiContentPart[];
}

interface ResponsesApiPayload {
  output?: ResponsesApiOutputItem[];
  output_text?: string;
}

/**
 * Real provider for spec section 10 (AI / Search Query Testing) - OpenAI.
 * Uses the Responses API with the built-in `web_search` tool so answers are
 * grounded in live web results with real `url_citation` annotations, rather
 * than just the model's memorized opinion. If the API errors or the
 * response shape doesn't include the expected annotations, this returns an
 * honest ERROR/empty result - it never fabricates a mention or citation.
 */
export class OpenAiQueryTestingProvider implements QueryTestingProvider {
  readonly name: QueryTestingProviderName = 'OPENAI';
  private readonly logger = new Logger(OpenAiQueryTestingProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async test(query: string, targetDomain: string): Promise<QueryTestingResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: query,
          tools: [{ type: 'web_search' }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return this.errorResult(`OpenAI API error ${response.status}: ${errText.slice(0, 500)}`);
      }

      const data = (await response.json()) as ResponsesApiPayload;
      return this.parseResponse(data, targetDomain);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`OpenAI query test failed: ${message}`);
      return this.errorResult(message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(data: ResponsesApiPayload, targetDomain: string): QueryTestingResult {
    let answerText = '';
    const citations: { url: string; title?: string }[] = [];

    for (const item of data.output ?? []) {
      if (item.type !== 'message') continue;
      for (const part of item.content ?? []) {
        if (typeof part.text === 'string') answerText += part.text;
        for (const ann of part.annotations ?? []) {
          if (ann.type === 'url_citation' && ann.url) {
            citations.push({ url: ann.url, title: ann.title });
          }
        }
      }
    }

    if (!answerText && typeof data.output_text === 'string') {
      answerText = data.output_text;
    }

    const normalizedDomain = targetDomain.replace(/^www\./i, '').toLowerCase();
    const hostnameOf = (url: string): string | null => {
      try {
        return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return null;
      }
    };

    const citedUrls = [...new Set(citations.map((c) => c.url))];
    const isTargetUrl = (url: string): boolean => {
      const host = hostnameOf(url);
      return host ? host === normalizedDomain || host.endsWith(`.${normalizedDomain}`) : false;
    };
    const targetCitationIndex = citedUrls.findIndex(isTargetUrl);
    const targetCited = targetCitationIndex !== -1;

    const brandToken = normalizedDomain.split('.')[0];
    const targetMentioned =
      targetCited || (brandToken.length > 2 && answerText.toLowerCase().includes(brandToken));

    // Exclude every citation that belongs to the target's own domain, not
    // just the first one found - otherwise a second self-citation (e.g. a
    // different path on the same site) would incorrectly show up as a
    // "competing" result in its own right.
    const competingUrls = citedUrls.filter((url) => !isTargetUrl(url));
    const competingBrands = [
      ...new Set(competingUrls.map(hostnameOf).filter((h): h is string => !!h)),
    ];

    return {
      status: 'OK',
      provider: this.name,
      targetMentioned,
      targetCited,
      citedUrls,
      competingBrands,
      competingUrls,
      answerSummary: answerText ? answerText.slice(0, 2000) : null,
      citationPosition: targetCited ? targetCitationIndex + 1 : null,
      providerMetadata: {
        model: this.model,
        citationCount: citations.length,
        usedWebSearchTool: true,
      },
    };
  }

  private errorResult(message: string): QueryTestingResult {
    return {
      status: 'ERROR',
      provider: this.name,
      targetMentioned: null,
      targetCited: null,
      citedUrls: [],
      competingBrands: [],
      competingUrls: [],
      answerSummary: null,
      citationPosition: null,
      providerMetadata: {},
      errorMessage: message,
    };
  }
}
