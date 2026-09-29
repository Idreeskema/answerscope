import { Module } from '@nestjs/common';
import { AeoAnalyzerService } from './aeo-analyzer.service';

@Module({
  providers: [AeoAnalyzerService],
  exports: [AeoAnalyzerService],
})
export class AeoModule {}
