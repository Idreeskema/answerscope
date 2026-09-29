import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.types';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAuditAccess, assertQueryAccess } from '../../common/security/ownership';
import { UpdateQueryDto } from './dto/update-query.dto';
import { CreateQueryDto } from './dto/create-query.dto';
import { QueryTestingService } from './providers/query-testing.service';
import { QueryTestingProviderName } from './providers/query-testing-provider.interface';

@ApiTags('queries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audits/:auditId/queries')
export class QueriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryTesting: QueryTestingService,
  ) {}

  @Get()
  async list(@Param('auditId') auditId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    return this.prisma.query.findMany({
      where: { auditId },
      orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
      include: { results: true },
    });
  }

  @Post()
  async create(
    @Param('auditId') auditId: string,
    @Body() dto: CreateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const audit = await assertAuditAccess(this.prisma, user.userId, auditId);
    return this.prisma.query.create({
      data: {
        auditId,
        websiteId: audit.websiteId,
        query: dto.query,
        intent: dto.intent,
        category: dto.category,
        topic: dto.topic,
        entity: dto.entity,
        importance: dto.importance ?? 5,
        status: 'APPROVED',
      },
    });
  }

  @Patch(':queryId')
  async update(
    @Param('queryId') queryId: string,
    @Body() dto: UpdateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await assertQueryAccess(this.prisma, user.userId, queryId);
    return this.prisma.query.update({
      where: { id: queryId },
      data: {
        ...dto,
        status: dto.status ?? (dto.query ? 'EDITED' : undefined),
      },
    });
  }

  @Delete(':queryId')
  async remove(@Param('queryId') queryId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertQueryAccess(this.prisma, user.userId, queryId);
    await this.prisma.query.delete({ where: { id: queryId } });
    return { deleted: true };
  }

  @Post(':queryId/test/:provider')
  async test(
    @Param('queryId') queryId: string,
    @Param('provider') provider: QueryTestingProviderName,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const query = await assertQueryAccess(this.prisma, user.userId, queryId);

    const result = await this.queryTesting.testQuery(query.query, query.website.domain, provider);

    if (result.status !== 'OK') {
      return result;
    }

    return this.prisma.queryResult.create({
      data: {
        queryId,
        provider: result.provider,
        targetMentioned: result.targetMentioned ?? false,
        targetCited: result.targetCited ?? false,
        citedUrls: result.citedUrls,
        competingBrands: result.competingBrands,
        competingUrls: result.competingUrls,
        answerSummary: result.answerSummary,
        citationPosition: result.citationPosition,
        providerMetadata: result.providerMetadata as any,
      },
    });
  }
}
