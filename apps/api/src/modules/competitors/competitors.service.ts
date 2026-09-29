import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertUrlIsSafeToFetch, SsrfViolationError } from '../../common/security/ssrf-guard';
import { CreateCompetitorDto } from './dto/create-competitor.dto';

/**
 * Implements Milestone 8 / spec section 11 (Competitor Analysis). Filled in
 * during integration (after the crawler + analyzer + scoring modules land):
 * analyzeCompetitor will crawl the competitor with the same pipeline used
 * for the target website, then diff Score/AEOAnalysis/SchemaAnalysis rows to
 * produce the CompetitorAnalysis.gaps evidence-backed findings.
 */
@Injectable()
export class CompetitorsService {
  private readonly logger = new Logger(CompetitorsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async addCompetitor(targetWebsiteId: string, dto: CreateCompetitorDto) {
    try {
      await assertUrlIsSafeToFetch(dto.url);
    } catch (err) {
      if (err instanceof SsrfViolationError) {
        throw new BadRequestException(`URL is not allowed: ${err.message}`);
      }
      throw err;
    }
    return this.prisma.competitor.create({
      data: { targetWebsiteId, url: dto.url, name: dto.name },
    });
  }

  async list(targetWebsiteId: string) {
    return this.prisma.competitor.findMany({
      where: { targetWebsiteId },
      include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  async analyzeCompetitor(auditId: string, competitorId: string): Promise<void> {
    this.logger.warn(
      `CompetitorsService.analyzeCompetitor is a STUB (audit ${auditId}, competitor ${competitorId})`,
    );
  }
}
