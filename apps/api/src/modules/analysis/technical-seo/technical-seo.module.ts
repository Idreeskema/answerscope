import { Module } from '@nestjs/common';
import { TechnicalSeoAnalyzerService } from './technical-seo-analyzer.service';

@Module({
  providers: [TechnicalSeoAnalyzerService],
  exports: [TechnicalSeoAnalyzerService],
})
export class TechnicalSeoModule {}
