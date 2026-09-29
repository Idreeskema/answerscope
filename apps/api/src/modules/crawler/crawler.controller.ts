import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('crawl-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('crawl-jobs')
export class CrawlerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':crawlJobId')
  async findOne(@Param('crawlJobId') crawlJobId: string) {
    const job = await this.prisma.crawlJob.findUnique({
      where: { id: crawlJobId },
      include: { errors: true },
    });
    if (!job) throw new NotFoundException('Crawl job not found');
    return job;
  }

  @Get(':crawlJobId/pages')
  async pages(@Param('crawlJobId') crawlJobId: string) {
    return this.prisma.page.findMany({ where: { crawlJobId } });
  }
}
