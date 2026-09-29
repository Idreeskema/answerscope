import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntityAnalyzerService } from './entity-analyzer.service';
import { ContentFixture, cleanupContentFixture, createContentFixture } from './test-support';

describe('EntityAnalyzerService (integration)', () => {
  const prisma = new PrismaService();
  const service = new EntityAnalyzerService(prisma);

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
      contentText: 'Placeholder content.',
      wordCount: 100,
      jsonLd: [],
      ...rest,
    } satisfies Prisma.PageCreateInput;
  }

  describe('JSON-LD extraction and dedup', () => {
    let fixture: ContentFixture;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);

      const orgBlock = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Acme Inc',
        description: 'Acme makes the best widgets.',
        sameAs: ['https://twitter.com/acmeinc'],
      };

      await prisma.page.create({
        data: makePage(fixture, { path: '/', title: 'Acme - Home', jsonLd: [orgBlock] }),
      });
      // Same Organization JSON-LD repeated on a second page (common - header
      // schema often appears on every page). Should dedupe to one Entity.
      await prisma.page.create({
        data: makePage(fixture, { path: '/about', title: 'About | Acme', jsonLd: [orgBlock] }),
      });
      await prisma.page.create({
        data: makePage(fixture, {
          path: '/products/widget',
          title: 'Widget Pro | Acme',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: 'Widget Pro',
              brand: { '@type': 'Brand', name: 'Acme Inc' },
            },
          ],
        }),
      });

      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('creates exactly one Organization entity despite the JSON-LD appearing on 2 pages', async () => {
      const orgs = await prisma.entity.findMany({ where: { auditId: fixture.auditId, type: 'ORGANIZATION' } });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].name).toBe('Acme Inc');
      expect(orgs[0].confidence).toBeCloseTo(0.9);
      expect(orgs[0].description).toContain('widgets');
      expect(orgs[0].relationships as any).toContainEqual({ type: 'SAME_AS', targetName: 'https://twitter.com/acmeinc' });
    });

    it('creates a Product entity linked to the Organization via relationships', async () => {
      const products = await prisma.entity.findMany({ where: { auditId: fixture.auditId, type: 'PRODUCT' } });
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Widget Pro');
      expect(products[0].relationships as any).toContainEqual({ type: 'MANUFACTURED_BY', targetName: 'Acme Inc' });
    });

    it('is idempotent when re-run for the same audit', async () => {
      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
      const all = await prisma.entity.findMany({ where: { auditId: fixture.auditId } });
      expect(all).toHaveLength(2);
    });
  });

  describe('fallback: og:site_name when no JSON-LD exists', () => {
    let fixture: ContentFixture;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);
      await prisma.page.create({
        data: makePage(fixture, {
          path: '/',
          title: 'Home',
          ogData: { site_name: 'Globex Corporation' },
        }),
      });
      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('derives an Organization entity from og:site_name with reduced confidence', async () => {
      const orgs = await prisma.entity.findMany({ where: { auditId: fixture.auditId, type: 'ORGANIZATION' } });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].name).toBe('Globex Corporation');
      expect(orgs[0].confidence).toBeLessThan(0.9);
    });
  });

  describe('fallback: footer copyright text when no JSON-LD or og:site_name exists', () => {
    let fixture: ContentFixture;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);
      await prisma.page.create({
        data: makePage(fixture, {
          path: '/',
          title: 'Home',
          contentText: 'Welcome to our site. Lots of content here. © 2026 Initech Holdings. All rights reserved.',
        }),
      });
      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('derives an Organization entity from the footer copyright line', async () => {
      const orgs = await prisma.entity.findMany({ where: { auditId: fixture.auditId, type: 'ORGANIZATION' } });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].name).toBe('Initech Holdings');
    });
  });

  describe('fallback: repeated title-suffix pattern as a last resort', () => {
    let fixture: ContentFixture;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);
      await prisma.page.create({ data: makePage(fixture, { path: '/', title: 'Home | Hooli' }) });
      await prisma.page.create({ data: makePage(fixture, { path: '/about', title: 'About | Hooli' }) });
      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('derives an Organization entity from a repeated title suffix', async () => {
      const orgs = await prisma.entity.findMany({ where: { auditId: fixture.auditId, type: 'ORGANIZATION' } });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].name).toBe('Hooli');
    });
  });

  describe('About page description enrichment', () => {
    let fixture: ContentFixture;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);
      await prisma.page.create({
        data: makePage(fixture, {
          path: '/',
          title: 'Home',
          ogData: { site_name: 'Vandelay Industries' },
        }),
      });
      await prisma.page.create({
        data: makePage(fixture, {
          path: '/about',
          title: 'About Us',
          contentText: 'Vandelay Industries is a leading importer and exporter of fine latex products. We were founded in 1989.',
        }),
      });
      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('enriches the fallback Organization entity with a description from the About page', async () => {
      const orgs = await prisma.entity.findMany({ where: { auditId: fixture.auditId, type: 'ORGANIZATION' } });
      expect(orgs).toHaveLength(1);
      expect(orgs[0].description).toContain('importer and exporter of fine latex products');
    });
  });

  describe('no entity signal at all', () => {
    let fixture: ContentFixture;

    beforeAll(async () => {
      fixture = await createContentFixture(prisma);
      await prisma.page.create({ data: makePage(fixture, { path: '/', title: 'Untitled Page' }) });
      await service.analyze(fixture.auditId, fixture.websiteId, fixture.crawlJobId);
    });

    afterAll(async () => {
      await cleanupContentFixture(prisma, fixture);
    });

    it('creates zero entities rather than fabricating one', async () => {
      const all = await prisma.entity.findMany({ where: { auditId: fixture.auditId } });
      expect(all).toHaveLength(0);
    });
  });
});
