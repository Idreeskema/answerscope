import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { WebsitesModule } from './modules/websites/websites.module';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { AuditsModule } from './modules/audits/audits.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { QueriesModule } from './modules/queries/queries.module';
import { CompetitorsModule } from './modules/competitors/competitors.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    WebsitesModule,
    CrawlerModule,
    AuditsModule,
    ScoringModule,
    QueriesModule,
    CompetitorsModule,
    RecommendationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
