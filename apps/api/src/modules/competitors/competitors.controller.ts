import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.types';
import { PrismaService } from '../../prisma/prisma.service';
import { assertWebsiteAccess } from '../../common/security/ownership';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';

@ApiTags('competitors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('websites/:websiteId/competitors')
export class CompetitorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly competitorsService: CompetitorsService,
  ) {}

  @Post()
  async create(
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateCompetitorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await assertWebsiteAccess(this.prisma, user.userId, websiteId);
    return this.competitorsService.addCompetitor(websiteId, dto);
  }

  @Get()
  async list(@Param('websiteId') websiteId: string, @CurrentUser() user: AuthenticatedUser) {
    await assertWebsiteAccess(this.prisma, user.userId, websiteId);
    return this.competitorsService.list(websiteId);
  }
}
