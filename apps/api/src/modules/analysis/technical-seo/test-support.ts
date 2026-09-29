import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Shared fixture builder for technical-seo-analyzer.service.spec.ts. Creates
 * a fully isolated Workspace -> Website -> CrawlJob -> Audit chain using
 * nanoid-suffixed unique values so it never collides with rows created by
 * other agents' tests running concurrently against the same dev database
 * (see docs/AGENT_BRIEF.md's "other agents working in parallel" section).
 *
 * Cleanup deletes only the Workspace this fixture created; every other row
 * (Website, CrawlJob, Audit, Page, PageLink, SEOCheck, ...) cascades from
 * that single delete per the FK `onDelete: Cascade` chain in schema.prisma.
 */
export interface SeoFixture {
  workspaceId: string;
  websiteId: string;
  crawlJobId: string;
  auditId: string;
  domain: string;
}

export async function createSeoFixture(
  prisma: PrismaService,
  opts?: { robotsTxtContent?: string | null; sitemapUrls?: string[] | null },
): Promise<SeoFixture> {
  const suffix = nanoid(8).toLowerCase();
  const domain = `seo-test-${suffix}.example.com`;

  const workspace = await prisma.workspace.create({
    data: { name: `SEO Test Workspace ${suffix}`, slug: `seo-test-${suffix}` },
  });
  const website = await prisma.website.create({
    data: {
      workspaceId: workspace.id,
      url: `https://${domain}`,
      domain,
      name: `SEO Test Site ${suffix}`,
    },
  });
  const crawlJob = await prisma.crawlJob.create({
    data: {
      websiteId: website.id,
      status: 'COMPLETED',
      robotsTxtContent: opts?.robotsTxtContent === undefined ? 'User-agent: *\nAllow: /' : opts.robotsTxtContent,
      sitemapUrls:
        opts?.sitemapUrls === undefined
          ? [`https://${domain}/sitemap.xml`]
          : opts.sitemapUrls === null
            ? Prisma.JsonNull
            : opts.sitemapUrls,
    },
  });
  const audit = await prisma.audit.create({
    data: { websiteId: website.id, crawlJobId: crawlJob.id, status: 'ANALYZING' },
  });

  return { workspaceId: workspace.id, websiteId: website.id, crawlJobId: crawlJob.id, auditId: audit.id, domain };
}

export async function cleanupSeoFixture(prisma: PrismaService, fixture: SeoFixture): Promise<void> {
  await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
}
