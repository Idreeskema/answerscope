import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.types';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAuditAccess } from '../../common/security/ownership';
import { AuditsService } from './audits.service';
import { CreateAuditDto } from './dto/create-audit.dto';

@ApiTags('audits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AuditsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditsService: AuditsService,
  ) {}

  @UseGuards(WorkspaceAccessGuard)
  @Post('workspaces/:workspaceId/websites/:websiteId/audits')
  create(@Param('websiteId') websiteId: string, @Body() dto: CreateAuditDto) {
    return this.auditsService.createAudit(websiteId, dto);
  }

  @UseGuards(WorkspaceAccessGuard)
  @Get('workspaces/:workspaceId/websites/:websiteId/audits')
  list(@Param('websiteId') websiteId: string) {
    return this.auditsService.listForWebsite(websiteId);
  }

  @Get('audits/:auditId')
  async getAudit(@Param('auditId') auditId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    return this.auditsService.getAudit(auditId);
  }

  @Get('audits/:auditId/status')
  async getStatus(@Param('auditId') auditId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    return this.auditsService.getStatus(auditId);
  }

  /** Serves the homepage screenshot captured during this audit's crawl
   * (see CrawlerService.captureHomepageScreenshot), for the dashboard's
   * "this is the site we analyzed" preview. */
  @Get('audits/:auditId/screenshot')
  async getScreenshot(
    @Param('auditId') auditId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const audit = await assertAuditAccess(this.prisma, user.userId, auditId);
    const crawlJob = audit.crawlJobId
      ? await this.prisma.crawlJob.findUnique({ where: { id: audit.crawlJobId } })
      : null;

    if (!crawlJob?.homepageScreenshotPath || !fs.existsSync(crawlJob.homepageScreenshotPath)) {
      throw new NotFoundException('No screenshot captured for this audit yet');
    }

    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' });
    return new StreamableFile(fs.createReadStream(crawlJob.homepageScreenshotPath));
  }

  @UseGuards(WorkspaceAccessGuard)
  @Post('workspaces/:workspaceId/websites/:websiteId/audit-changes')
  async compare(
    @Param('websiteId') websiteId: string,
    @Body() body: { fromAuditId: string; toAuditId: string },
  ) {
    return this.auditsService.compareAudits(websiteId, body.fromAuditId, body.toAuditId);
  }
}
