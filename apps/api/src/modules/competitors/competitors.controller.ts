import { Body, Controller, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.types';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAuditAccess, assertWebsiteAccess } from '../../common/security/ownership';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';

@ApiTags('competitors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CompetitorsController {
  private readonly logger = new Logger(CompetitorsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly competitorsService: CompetitorsService,
  ) {}

  @Post('websites/:websiteId/competitors')
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateCompetitorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await assertWebsiteAccess(this.prisma, user.userId, websiteId);
    return this.competitorsService.addCompetitor(websiteId, dto);
  }

  @Get('websites/:websiteId/competitors')
  async list(@Param('websiteId') websiteId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertWebsiteAccess(this.prisma, user.userId, websiteId);
    return this.competitorsService.list(websiteId);
  }

  @Post('audits/:auditId/competitors/:competitorId/analyze')
  async analyze(
    @Param('auditId') auditId: string,
    @Param('competitorId') competitorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    // Fire-and-forget: crawling+analyzing a competitor can take a while,
    // same async-job pattern as AuditsService.createAudit.
    this.competitorsService.analyzeCompetitor(auditId, competitorId).catch((err) => {
      this.logger.error(
        `Competitor analysis failed (audit ${auditId}, competitor ${competitorId}): ${err?.message}`,
        err?.stack,
      );
    });
    return { started: true };
  }
}
