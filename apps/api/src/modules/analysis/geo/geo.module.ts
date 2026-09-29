import { Module } from '@nestjs/common';
import { GeoAnalyzerService } from './geo-analyzer.service';

@Module({
  providers: [GeoAnalyzerService],
  exports: [GeoAnalyzerService],
})
export class GeoModule {}
