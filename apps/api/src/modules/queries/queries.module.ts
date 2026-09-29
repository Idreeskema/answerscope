import { Module } from '@nestjs/common';
import { QueriesController } from './queries.controller';
import { QueryGeneratorService } from './query-generator.service';
import { QueryTestingService } from './providers/query-testing.service';

@Module({
  controllers: [QueriesController],
  providers: [QueryGeneratorService, QueryTestingService],
  exports: [QueryGeneratorService, QueryTestingService],
})
export class QueriesModule {}
