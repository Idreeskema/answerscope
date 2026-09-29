import { Controller, Get, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
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
  async generate(
    @Param('auditId') auditId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    const { filePath } = await this.reportsService.generatePdf(auditId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="audit-${auditId}.pdf"`,
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }
}
