import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SchemaAnalyzerService } from './schema-analyzer.service';
import { ContentFixture, cleanupContentFixture, createContentFixture } from './test-support';

describe('SchemaAnalyzerService (integration)', () => {
  const prisma = new PrismaService();
  const service = new SchemaAnalyzerService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function makePage(fixture: ContentFixture, overrides: Partial<Prisma.PageCreateInput> & { path: string }) {
    const { path, ...rest } = overrides;
    const url = `https://${fixture.domain}${path}`;
    return {
      crawlJob: { connect: { id: fixture.crawlJobId } },
      website: { connect: { id: fixture.websiteId } },
      url,
      normalizedUrl: url,
      statusCode: 200,
      isIndexable: true,
      title: 'A Page Title',
      jsonLd: [],
      ...rest,
    } satisfies Prisma.PageCreateInput;
  }

  let fixture: ContentFixture;

  beforeAll(async () => {
    fixture = await createContentFixture(prisma);

    const validOrgPage = await prisma.page.create({
      data: makePage(fixture, {
        path: '/',
        jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: `https://${fixture.domain}/` }],
      }),
    });

    const invalidOrgPage = await prisma.page.create({
      data: makePage(fixture, {
        path: '/broken-org',
        jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' }],
      }),
    });

    const validFaqPage = await prisma.page.create({
      data: makePage(fixture, {
        path: '/faq',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'What is Acme?',
                acceptedAnswer: { '@type': 'Answer', text: 'A widget company.' },
              },
            ],
          },
        ],
      }),
    });

    const invalidFaqPage = await prisma.page.create({
      data: makePage(fixture, {
        path: '/faq-broken',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [{ name: 'What is Acme?' }],
          },
        ],
      }),
    });

    const graphPage = await prisma.page.create({
      data: makePage(fixture, {
        path: '/graph',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'WebSite', name: 'Acme', url: `https://${fixture.domain}/` },
              { '@type': 'Person', name: 'Jane Doe' },
            ],
          },
        ],
      }),
    });

    const unknownTypePage = await prisma.page.create({
      data: makePage(fixture, {
        path: '/recipe',
        jsonLd: [{ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Pancakes' }],
      }),
    });

    Object.assign(fixture, {
      validOrgPage,
      invalidOrgPage,
      validFaqPage,
      invalidFaqPage,
      graphPage,
      unknownTypePage,
    });

    await service.analyze(fixture.auditId, fixture.crawlJobId);
  });

  afterAll(async () => {
    await cleanupContentFixture(prisma, fixture);
  });

  async function rowsFor(pageId: string) {
    return prisma.schemaAnalysis.findMany({ where: { auditId: fixture.auditId, pageId } });
  }

  it('validates a complete Organization block as valid', async () => {
    const rows = await rowsFor((fixture as any).validOrgPage.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].schemaType).toBe('Organization');
    expect(rows[0].isValid).toBe(true);
    expect(rows[0].errors).toEqual([]);
  });

  it('flags an Organization block missing url as invalid with a specific error', async () => {
    const rows = await rowsFor((fixture as any).invalidOrgPage.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].isValid).toBe(false);
    expect(rows[0].errors as string[]).toContain('Missing required property "url" for Organization');
  });

  it('validates a well-formed FAQPage as valid', async () => {
    const rows = await rowsFor((fixture as any).validFaqPage.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].isValid).toBe(true);
  });

  it('flags an FAQPage with an incomplete Question/Answer pair as invalid', async () => {
    const rows = await rowsFor((fixture as any).invalidFaqPage.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].isValid).toBe(false);
    expect((rows[0].errors as string[]).some((e) => e.includes('acceptedAnswer.text'))).toBe(true);
  });

  it('flattens an @graph-wrapped block into separate SchemaAnalysis rows', async () => {
    const rows = await rowsFor((fixture as any).graphPage.id);
    expect(rows).toHaveLength(2);
    const types = rows.map((r) => r.schemaType).sort();
    expect(types).toEqual(['Person', 'WebSite']);
  });

  it('preserves the raw JSON-LD block verbatim', async () => {
    const rows = await rowsFor((fixture as any).validOrgPage.id);
    expect((rows[0].rawJsonLd as any).name).toBe('Acme');
  });

  it('does not fabricate an invalid verdict for an unrecognized schema type', async () => {
    const rows = await rowsFor((fixture as any).unknownTypePage.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].schemaType).toBe('Recipe');
    expect(rows[0].isValid).toBe(true);
  });

  it('is idempotent when re-run for the same audit', async () => {
    await service.analyze(fixture.auditId, fixture.crawlJobId);
    const all = await prisma.schemaAnalysis.findMany({ where: { auditId: fixture.auditId } });
    // 1 (org) + 1 (broken org) + 1 (faq) + 1 (broken faq) + 2 (graph) + 1 (recipe) = 7
    expect(all).toHaveLength(7);
  });
});
