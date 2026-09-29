import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Every resource ultimately hangs off Website.workspaceId. These helpers
 * walk that relation and confirm the requesting user is a member of the
 * owning workspace before a controller hands back any data - closing the
 * IDOR gap that would otherwise exist on routes keyed only by a resource id
 * (e.g. GET /audits/:auditId) without a :workspaceId in the path.
 * Spec section 19: "Workspace isolation" / "unauthorized workspace access".
 */

async function assertMember(prisma: PrismaService, userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) {
    throw new ForbiddenException('You do not have access to this resource');
  }
}

export async function assertWebsiteAccess(prisma: PrismaService, userId: string, websiteId: string) {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website) throw new NotFoundException('Website not found');
  await assertMember(prisma, userId, website.workspaceId);
  return website;
}

export async function assertAuditAccess(prisma: PrismaService, userId: string, auditId: string) {
  const audit = await prisma.audit.findUnique({ where: { id: auditId }, include: { website: true } });
  if (!audit) throw new NotFoundException('Audit not found');
  await assertMember(prisma, userId, audit.website.workspaceId);
  return audit;
}

export async function assertQueryAccess(prisma: PrismaService, userId: string, queryId: string) {
  const query = await prisma.query.findUnique({
    where: { id: queryId },
    include: { website: true },
  });
  if (!query) throw new NotFoundException('Query not found');
  await assertMember(prisma, userId, query.website.workspaceId);
  return query;
}

export async function assertRecommendationAccess(
  prisma: PrismaService,
  userId: string,
  recommendationId: string,
) {
  const recommendation = await prisma.recommendation.findUnique({
    where: { id: recommendationId },
    include: { audit: { include: { website: true } } },
  });
  if (!recommendation) throw new NotFoundException('Recommendation not found');
  await assertMember(prisma, userId, recommendation.audit.website.workspaceId);
  return recommendation;
}

export async function assertFixAccess(prisma: PrismaService, userId: string, fixId: string) {
  const fix = await prisma.generatedFix.findUnique({
    where: { id: fixId },
    include: { recommendation: { include: { audit: { include: { website: true } } } } },
  });
  if (!fix) throw new NotFoundException('Fix not found');
  await assertMember(prisma, userId, fix.recommendation.audit.website.workspaceId);
  return fix;
}
