import { nanoid } from 'nanoid';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Shared fixture builder for aeo-analyzer.service.spec.ts. Creates a fully
 * isolated Workspace -> Website -> CrawlJob -> Audit chain using
 * nanoid-suffixed unique values so it never collides with rows created by
 * other agents' tests running concurrently against the same dev database
 * (see docs/AGENT_BRIEF.md's "other agents working in parallel" section).
 *
 * Cleanup deletes only the Workspace this fixture created; every other row
 * (Website, CrawlJob, Audit, Page, Entity, SchemaAnalysis, AEOAnalysis, ...)
 * cascades from that single delete per the FK `onDelete: Cascade` chain in
 * schema.prisma.
 */
export interface AeoFixture {
  workspaceId: string;
  websiteId: string;
  crawlJobId: string;
  auditId: string;
  domain: string;
}

export async function createAeoFixture(prisma: PrismaService): Promise<AeoFixture> {
  const suffix = nanoid(8).toLowerCase();
  const domain = `aeo-test-${suffix}.example.com`;

  const workspace = await prisma.workspace.create({
    data: { name: `AEO Test Workspace ${suffix}`, slug: `aeo-test-${suffix}` },
  });
  const website = await prisma.website.create({
    data: {
      workspaceId: workspace.id,
      url: `https://${domain}`,
      domain,
      name: `AEO Test Site ${suffix}`,
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

export async function cleanupAeoFixture(prisma: PrismaService, fixture: AeoFixture): Promise<void> {
  await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
}
