import { nanoid } from 'nanoid';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Shared fixture builder for content-analyzer / entity-analyzer /
 * schema-analyzer service specs. Creates an isolated Workspace -> Website ->
 * CrawlJob -> Audit chain with nanoid-suffixed unique values so it never
 * collides with rows created by other agents' tests running concurrently
 * against the same shared dev database (see docs/AGENT_BRIEF.md).
 *
 * Cleanup deletes only the Workspace this fixture created; every other row
 * cascades from that single delete per schema.prisma's `onDelete: Cascade`
 * chain.
 */
export interface ContentFixture {
  workspaceId: string;
  websiteId: string;
  crawlJobId: string;
  auditId: string;
  domain: string;
}

export async function createContentFixture(prisma: PrismaService): Promise<ContentFixture> {
  const suffix = nanoid(8).toLowerCase();
  const domain = `content-test-${suffix}.example.com`;

  const workspace = await prisma.workspace.create({
    data: { name: `Content Test Workspace ${suffix}`, slug: `content-test-${suffix}` },
  });
  const website = await prisma.website.create({
    data: {
      workspaceId: workspace.id,
      url: `https://${domain}`,
      domain,
      name: `Content Test Site ${suffix}`,
    },
  });
  const crawlJob = await prisma.crawlJob.create({
    data: { websiteId: website.id, status: 'COMPLETED' },
  });
  const audit = await prisma.audit.create({
    data: { websiteId: website.id, crawlJobId: crawlJob.id, status: 'ANALYZING' },
  });

  return { workspaceId: workspace.id, websiteId: website.id, crawlJobId: crawlJob.id, auditId: audit.id, domain };
}

export async function cleanupContentFixture(prisma: PrismaService, fixture: ContentFixture): Promise<void> {
  await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
}
