import { Injectable } from '@nestjs/common';
import {
  QueryTestingProvider,
  QueryTestingProviderName,
  QueryTestingResult,
} from './query-testing-provider.interface';

/**
 * Default provider when no external API key is configured. Never invents
 * mentions/citations - always reports NOT_CONFIGURED so the UI can show
 * "Not tested (provider not configured)" instead of a fabricated result.
 */
@Injectable()
export class NullQueryTestingProvider implements QueryTestingProvider {
  constructor(readonly name: QueryTestingProviderName) {}

  isConfigured(): boolean {
    return false;
  }

  async test(_query: string, _targetDomain: string): Promise<QueryTestingResult> {
    return {
      status: 'NOT_CONFIGURED',
      provider: this.name,
      targetMentioned: null,
      targetCited: null,
      citedUrls: [],
      competingBrands: [],
      competingUrls: [],
      answerSummary: null,
      citationPosition: null,
      providerMetadata: {},
      errorMessage: `${this.name} API key is not configured. Set the corresponding *_API_KEY env var to enable this provider.`,
    };
  }
}
