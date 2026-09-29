import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationEngineService } from './recommendation-engine.service';
import { FixGeneratorService } from './fix-generator.service';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationEngineService, FixGeneratorService],
  exports: [RecommendationEngineService, FixGeneratorService],
})
export class RecommendationsModule {}
