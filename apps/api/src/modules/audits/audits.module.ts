import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CrawlerModule } from '../crawler/crawler.module';
import { TechnicalSeoModule } from '../analysis/technical-seo/technical-seo.module';
import { ContentModule } from '../analysis/content/content.module';
import { AeoModule } from '../analysis/aeo/aeo.module';
import { GeoModule } from '../analysis/geo/geo.module';
import { ScoringModule } from '../scoring/scoring.module';
import { QueriesModule } from '../queries/queries.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

@Module({
  imports: [
    WorkspacesModule,
    CrawlerModule,
    TechnicalSeoModule,
    ContentModule,
    AeoModule,
    GeoModule,
    ScoringModule,
    QueriesModule,
    RecommendationsModule,
  ],
  controllers: [AuditsController],
  providers: [AuditsService],
  exports: [AuditsService],
})
export class AuditsModule {}
