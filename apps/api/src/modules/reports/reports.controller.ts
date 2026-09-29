import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.types';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAuditAccess } from '../../common/security/ownership';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audits/:auditId/report')
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  @Get()
  async generate(@Param('auditId') auditId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    return this.reportsService.generatePdf(auditId);
  }
}
