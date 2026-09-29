import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'reports');

const AUDIT_REPORT_INCLUDE = Prisma.validator<Prisma.AuditInclude>()({
  website: true,
  scores: true,
  seoChecks: { include: { page: true } },
  recommendations: true,
});

type AuditReportData = Prisma.AuditGetPayload<{ include: typeof AUDIT_REPORT_INCLUDE }>;

/**
 * Report/PDF export (spec section "Report/PDF Export", module 16).
 * Renders the same evidence-based structure as the dashboard: overall +
 * category scores, critical/high issues with evidence, and top
 * recommendations - never a bare number.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(auditId: string): Promise<{ filePath: string; reportId: string }> {
    const audit = await this.prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        website: true,
        scores: { orderBy: { category: 'asc' } },
        seoChecks: { where: { status: 'FAIL' }, include: { page: true } },
        recommendations: { orderBy: { priority: 'desc' }, take: 15 },
      },
    });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.status !== 'COMPLETED') {
      throw new NotFoundException(
        `Audit is not completed yet (status: ${audit.status}) - no report to generate`,
      );
    }

    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const filePath = path.join(STORAGE_DIR, `${auditId}.pdf`);

    await this.render(filePath, audit);

    const report = await this.prisma.report.create({
      data: { auditId, type: 'PDF', filePath },
    });

    return { filePath, reportId: report.id };
  }

  private render(filePath: string, audit: AuditReportData): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(20).text('AI Search Readiness Report', { align: 'left' });
      doc.moveDown(0.2);
      doc.fontSize(11).fillColor('#555').text(audit.website.url);
      doc.fillColor('#000');
      doc.moveDown();

      doc.fontSize(16).text(`AI Search Readiness: ${audit.overallScore?.toFixed(0) ?? 'N/A'}/100`);
      doc.fontSize(9).fillColor('#777').text(`Scoring version: ${audit.calculationVersion ?? 'n/a'}`);
      doc.fillColor('#000');
      doc.moveDown();

      doc.fontSize(14).text('Category Scores');
      doc.moveDown(0.3);
      for (const score of audit.scores) {
        doc
          .fontSize(11)
          .text(
            `${score.category}: ${score.normalizedScore.toFixed(1)} (raw ${score.rawScore.toFixed(1)}, weight ${(score.weight * 100).toFixed(0)}%)`,
          );
      }
      doc.moveDown();

      doc.fontSize(14).text('Failed Checks (Evidence)');
      doc.moveDown(0.3);
      if (audit.seoChecks.length === 0) {
        doc.fontSize(10).fillColor('#777').text('No failing checks recorded.');
        doc.fillColor('#000');
      }
      for (const check of audit.seoChecks.slice(0, 30)) {
        doc.fontSize(11).fillColor('#B00020').text(`[${check.severity}] ${check.checkId}`);
        doc.fontSize(10).fillColor('#000').text(`Evidence: ${check.evidence}`);
        doc.fontSize(10).fillColor('#333').text(`Recommendation: ${check.recommendation}`);
        if (check.page?.url) {
          doc.fontSize(9).fillColor('#555').text(`Page: ${check.page.url}`);
        }
        doc.fillColor('#000');
        doc.moveDown(0.5);
      }
      doc.moveDown();

      doc.fontSize(14).text('Top Recommendations');
      doc.moveDown(0.3);
      if (audit.recommendations.length === 0) {
        doc.fontSize(10).fillColor('#777').text('No recommendations generated.');
        doc.fillColor('#000');
      }
      audit.recommendations.forEach((rec, idx) => {
        doc.fontSize(11).text(`${idx + 1}. [${rec.severity}] ${rec.title}`);
        doc.fontSize(10).fillColor('#333').text(rec.explanation);
        doc.fontSize(10).fillColor('#000').text(`Action: ${rec.action}`);
        if (rec.affectedUrl) {
          doc.fontSize(9).fillColor('#555').text(`Affected: ${rec.affectedUrl}`);
        }
        doc.fillColor('#000');
        doc.moveDown(0.5);
      });

      doc.moveDown();
      doc
        .fontSize(8)
        .fillColor('#777')
        .text(
          'This is an AI Search Readiness Score based on measurable, explainable website characteristics. It is not a prediction of ranking or citation by any specific AI system.',
          { align: 'left' },
        );

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
  }
}
