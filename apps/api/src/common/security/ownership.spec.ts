import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAuditAccess, assertWebsiteAccess } from './ownership';

describe('ownership guards', () => {
  let prisma: PrismaService;
  const suffix = nanoid(8);

  let ownerUserId: string;
  let outsiderUserId: string;
  let workspaceId: string;
  let websiteId: string;
  let auditId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);

    const owner = await prisma.user.create({
      data: { email: `owner-${suffix}@test.local`, passwordHash: 'x', name: 'Owner' },
    });
    const outsider = await prisma.user.create({
      data: { email: `outsider-${suffix}@test.local`, passwordHash: 'x', name: 'Outsider' },
    });
    ownerUserId = owner.id;
    outsiderUserId = outsider.id;

    const workspace = await prisma.workspace.create({
      data: { name: `ownership-test-${suffix}`, slug: `ownership-test-${suffix}` },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMember.create({
      data: { workspaceId, userId: ownerUserId, role: 'OWNER' },
    });

    const website = await prisma.website.create({
      data: { workspaceId, url: `https://ownership-${suffix}.example.com`, domain: `ownership-${suffix}.example.com` },
    });
    websiteId = website.id;

    const audit = await prisma.audit.create({ data: { websiteId, status: 'COMPLETED' } });
    auditId = audit.id;
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { id: auditId } });
    await prisma.website.deleteMany({ where: { id: websiteId } });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, outsiderUserId] } } });
    await prisma.$disconnect();
  });

  it('allows a workspace member to access a website', async () => {
    await expect(assertWebsiteAccess(prisma, ownerUserId, websiteId)).resolves.toMatchObject({ id: websiteId });
  });

  it('denies a non-member access to a website', async () => {
    await expect(assertWebsiteAccess(prisma, outsiderUserId, websiteId)).rejects.toThrow(ForbiddenException);
  });

  it('404s on a website id that does not exist', async () => {
    await expect(assertWebsiteAccess(prisma, ownerUserId, 'not-a-real-id')).rejects.toThrow(NotFoundException);
  });

  it('allows a workspace member to access an audit via its website', async () => {
    await expect(assertAuditAccess(prisma, ownerUserId, auditId)).resolves.toMatchObject({ id: auditId });
  });

  it('denies a non-member access to an audit', async () => {
    await expect(assertAuditAccess(prisma, outsiderUserId, auditId)).rejects.toThrow(ForbiddenException);
  });
});
