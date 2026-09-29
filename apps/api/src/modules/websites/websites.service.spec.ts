import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { WebsitesService } from './websites.service';

describe('WebsitesService', () => {
  let prisma: PrismaService;
  let service: WebsitesService;
  const suffix = nanoid(8);
  let workspaceId: string;
  const createdWebsiteIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [WebsitesService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(WebsitesService);

    const workspace = await prisma.workspace.create({
      data: { name: `websites-test-${suffix}`, slug: `websites-test-${suffix}` },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await prisma.website.deleteMany({ where: { id: { in: createdWebsiteIds } } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('creates a website for a normal public URL', async () => {
    const website = await service.create(workspaceId, { url: `https://example.com/?t=${suffix}` });
    createdWebsiteIds.push(website.id);
    expect(website.domain).toBe('example.com');
    expect(website.workspaceId).toBe(workspaceId);
  });

  it('rejects a localhost URL', async () => {
    await expect(service.create(workspaceId, { url: 'http://localhost:8080/' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a private-IP literal URL', async () => {
    await expect(service.create(workspaceId, { url: 'http://10.0.0.5/' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a cloud metadata endpoint URL', async () => {
    await expect(
      service.create(workspaceId, { url: 'http://169.254.169.254/latest/meta-data' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists only websites in the given workspace', async () => {
    const websites = await service.listForWorkspace(workspaceId);
    expect(websites.every((w) => w.workspaceId === workspaceId)).toBe(true);
    expect(websites.some((w) => w.domain === 'example.com')).toBe(true);
  });
});
