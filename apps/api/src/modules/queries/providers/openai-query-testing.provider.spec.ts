import { OpenAiQueryTestingProvider } from './openai-query-testing.provider';

describe('OpenAiQueryTestingProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reports target cited when a url_citation annotation matches the target domain', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'Acme is a popular project management tool for small teams.',
                annotations: [
                  { type: 'url_citation', url: 'https://acme.example.com/pricing', title: 'Acme Pricing' },
                  { type: 'url_citation', url: 'https://competitor.example.com/', title: 'Competitor' },
                ],
              },
            ],
          },
        ],
      }),
    }) as any;

    const provider = new OpenAiQueryTestingProvider('fake-key');
    const result = await provider.test('Best project management tool for small teams', 'acme.example.com');

    expect(result.status).toBe('OK');
    expect(result.targetCited).toBe(true);
    expect(result.targetMentioned).toBe(true);
    expect(result.citationPosition).toBe(1);
    expect(result.citedUrls).toEqual([
      'https://acme.example.com/pricing',
      'https://competitor.example.com/',
    ]);
    expect(result.competingUrls).toEqual(['https://competitor.example.com/']);
    expect(result.competingBrands).toEqual(['competitor.example.com']);
    expect(result.answerSummary).toContain('Acme is a popular project management tool');
  });

  it('reports target not cited/mentioned when nothing matches', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'Some other unrelated tools are popular for this.',
                annotations: [{ type: 'url_citation', url: 'https://other.example.com/' }],
              },
            ],
          },
        ],
      }),
    }) as any;

    const provider = new OpenAiQueryTestingProvider('fake-key');
    const result = await provider.test('Best tool?', 'acme.example.com');

    expect(result.status).toBe('OK');
    expect(result.targetCited).toBe(false);
    expect(result.targetMentioned).toBe(false);
    expect(result.citationPosition).toBeNull();
  });

  it('returns an ERROR result on a non-OK HTTP response, never fabricating data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    }) as any;

    const provider = new OpenAiQueryTestingProvider('bad-key');
    const result = await provider.test('Anything', 'acme.example.com');

    expect(result.status).toBe('ERROR');
    expect(result.targetMentioned).toBeNull();
    expect(result.targetCited).toBeNull();
    expect(result.errorMessage).toContain('401');
  });

  it('returns an ERROR result when fetch throws (e.g. network/timeout)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const provider = new OpenAiQueryTestingProvider('fake-key');
    const result = await provider.test('Anything', 'acme.example.com');

    expect(result.status).toBe('ERROR');
    expect(result.errorMessage).toContain('network down');
  });

  it('isConfigured reflects whether an api key was supplied', () => {
    expect(new OpenAiQueryTestingProvider('key').isConfigured()).toBe(true);
    expect(new OpenAiQueryTestingProvider('').isConfigured()).toBe(false);
  });
});
