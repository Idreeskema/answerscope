import { Module } from '@nestjs/common';
import { CrawlerModule } from '../crawler/crawler.module';
import { TechnicalSeoModule } from '../analysis/technical-seo/technical-seo.module';
import { ContentModule } from '../analysis/content/content.module';
import { AeoModule } from '../analysis/aeo/aeo.module';
import { GeoModule } from '../analysis/geo/geo.module';
import { ScoringModule } from '../scoring/scoring.module';
import { CompetitorsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';

@Module({
  imports: [CrawlerModule, TechnicalSeoModule, ContentModule, AeoModule, GeoModule, ScoringModule],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
  exports: [CompetitorsService],
})
export class CompetitorsModule {}
