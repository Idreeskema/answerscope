import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Implements Report/PDF export. Filled in during integration using pdfkit:
 * render website URL, overall + category scores, critical/high issues with
 * evidence + recommendation, top recommendations. Written to disk under
 * apps/api/storage/reports/{auditId}.pdf and tracked via the Report model.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(auditId: string) {
    this.logger.warn(`ReportsService.generatePdf is a STUB (audit ${auditId})`);
    const audit = await this.prisma.audit.findUnique({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    throw new NotFoundException('PDF report generation not yet implemented');
  }
}
