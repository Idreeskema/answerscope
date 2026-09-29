import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertUrlIsSafeToFetch, SsrfViolationError } from '../../common/security/ssrf-guard';
import { CreateWebsiteDto } from './dto/create-website.dto';

@Injectable()
export class WebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateWebsiteDto) {
    let hostname: string;
    try {
      const result = await assertUrlIsSafeToFetch(dto.url);
      hostname = result.hostname;
    } catch (err) {
      if (err instanceof SsrfViolationError) {
        throw new BadRequestException(`URL is not allowed: ${err.message}`);
      }
      throw err;
    }

    return this.prisma.website.create({
      data: {
        workspaceId,
        url: dto.url,
        domain: hostname,
        name: dto.name ?? hostname,
      },
    });
  }

  async listForWorkspace(workspaceId: string) {
    return this.prisma.website.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, websiteId: string) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });
    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  async remove(workspaceId: string, websiteId: string) {
    await this.findOne(workspaceId, websiteId);
    await this.prisma.website.delete({ where: { id: websiteId } });
    return { deleted: true };
  }
}
