import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertAuditAccess,
  assertFixAccess,
  assertRecommendationAccess,
} from '../../common/security/ownership';
import { FixGeneratorService } from './fix-generator.service';
import { UpdateFixStatusDto } from './dto/update-fix-status.dto';

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RecommendationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fixGenerator: FixGeneratorService,
  ) {}

  @Get('audits/:auditId/recommendations')
  async list(@Param('auditId') auditId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertAuditAccess(this.prisma, user.userId, auditId);
    return this.prisma.recommendation.findMany({
      where: { auditId },
      orderBy: { priority: 'desc' },
      include: { fixes: true },
    });
  }

  @Post('recommendations/:recommendationId/fixes')
  async generateFix(
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await assertRecommendationAccess(this.prisma, user.userId, recommendationId);
    return this.fixGenerator.generateFix(recommendationId);
  }

  @Patch('recommendations/fixes/:fixId')
  async updateFixStatus(
    @Param('fixId') fixId: string,
    @Body() dto: UpdateFixStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await assertFixAccess(this.prisma, user.userId, fixId);
    return this.prisma.generatedFix.update({
      where: { id: fixId },
      data: {
        status: dto.status,
        reviewedById: user.userId,
        reviewedAt: new Date(),
      },
    });
  }
}
