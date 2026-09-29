import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @UseGuards(WorkspaceAccessGuard)
  @Post('workspaces/:workspaceId/websites/:websiteId/audit-changes')
  async compare(
    @Param('websiteId') websiteId: string,
    @Body() body: { fromAuditId: string; toAuditId: string },
  ) {
    return this.auditsService.compareAudits(websiteId, body.fromAuditId, body.toAuditId);
  }
}
