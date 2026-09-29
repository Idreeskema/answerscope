import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QueryTestingProvider,
  QueryTestingProviderName,
  QueryTestingResult,
} from './query-testing-provider.interface';
import { NullQueryTestingProvider } from './null-query-testing.provider';

const PROVIDER_ENV_KEYS: Record<QueryTestingProviderName, string> = {
  OPENAI: 'OPENAI_API_KEY',
  ANTHROPIC: 'ANTHROPIC_API_KEY',
  PERPLEXITY: 'PERPLEXITY_API_KEY',
  GOOGLE_AI_OVERVIEWS: 'GOOGLE_AI_API_KEY',
};

/**
 * Central registry/dispatcher for AI Query Testing providers (spec section
 * 10). Real provider implementations (calling the OpenAI/Anthropic/
 * Perplexity/Google APIs) can be dropped in under providers/ and registered
 * here; until an API key is present in .env this always resolves to
 * NullQueryTestingProvider so results are never fabricated.
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
    // TODO(integration boundary): construct the real provider here, e.g.
    //   if (name === 'OPENAI') return new OpenAiQueryTestingProvider(key);
    // Real providers are not implemented in this build - no API keys are
    // configured in this environment, so falling back to Null keeps the
    // product honest rather than shipping untested network code.
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
