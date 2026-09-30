import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QueryTestingProvider,
  QueryTestingProviderName,
  QueryTestingResult,
} from './query-testing-provider.interface';
import { NullQueryTestingProvider } from './null-query-testing.provider';
import { OpenAiQueryTestingProvider } from './openai-query-testing.provider';

const PROVIDER_ENV_KEYS: Record<QueryTestingProviderName, string> = {
  OPENAI: 'OPENAI_API_KEY',
  ANTHROPIC: 'ANTHROPIC_API_KEY',
  PERPLEXITY: 'PERPLEXITY_API_KEY',
  GOOGLE_AI_OVERVIEWS: 'GOOGLE_AI_API_KEY',
};

/**
 * Central registry/dispatcher for AI Query Testing providers (spec section
 * 10). OPENAI is a real integration (web-search-grounded OpenAI Responses
 * API - see openai-query-testing.provider.ts) once OPENAI_API_KEY is set.
 * The other three providers don't have a real implementation yet; drop one
 * in under providers/ following the same pattern and register it in
 * resolveProvider(). Without a configured key, or for an unimplemented
 * provider, this always resolves to NullQueryTestingProvider so results are
 * never fabricated.
 */
@Injectable()
export class QueryTestingService {
  constructor(private readonly config: ConfigService) {}

  listProviders(): QueryTestingProviderName[] {
    return Object.keys(PROVIDER_ENV_KEYS) as QueryTestingProviderName[];
  }

  private resolveProvider(name: QueryTestingProviderName): QueryTestingProvider {
    const key = this.config.get<string>(PROVIDER_ENV_KEYS[name]);
    if (!key) {
      return new NullQueryTestingProvider(name);
    }

    if (name === 'OPENAI') {
      const model = this.config.get<string>('OPENAI_QUERY_TEST_MODEL');
      return model ? new OpenAiQueryTestingProvider(key, model) : new OpenAiQueryTestingProvider(key);
    }

    // TODO(integration boundary): Anthropic/Perplexity/Google AI Overviews
    // don't have a real provider implementation yet - drop one in under
    // providers/ following OpenAiQueryTestingProvider's pattern and register
    // it here. Falling back to Null keeps the product honest in the
    // meantime rather than shipping untested network code.
    return new NullQueryTestingProvider(name);
  }

  async testQuery(
    query: string,
    targetDomain: string,
    providerName: QueryTestingProviderName,
  ): Promise<QueryTestingResult> {
    const provider = this.resolveProvider(providerName);
    return provider.test(query, targetDomain);
  }
}
