import { Module } from '@nestjs/common';
import { ContentAnalyzerService } from './content-analyzer.service';
import { EntityAnalyzerService } from './entity-analyzer.service';
import { SchemaAnalyzerService } from './schema-analyzer.service';

@Module({
  providers: [ContentAnalyzerService, EntityAnalyzerService, SchemaAnalyzerService],
  exports: [ContentAnalyzerService, EntityAnalyzerService, SchemaAnalyzerService],
})
export class ContentModule {}
