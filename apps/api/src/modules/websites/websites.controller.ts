import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { WebsitesService } from './websites.service';
import { CreateWebsiteDto } from './dto/create-website.dto';

@ApiTags('websites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
@Controller('workspaces/:workspaceId/websites')
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Post()
  create(@Param('workspaceId') workspaceId: string, @Body() dto: CreateWebsiteDto) {
    return this.websitesService.create(workspaceId, dto);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.websitesService.listForWorkspace(workspaceId);
  }

  @Get(':websiteId')
  findOne(@Param('workspaceId') workspaceId: string, @Param('websiteId') websiteId: string) {
    return this.websitesService.findOne(workspaceId, websiteId);
  }

  @Delete(':websiteId')
  remove(@Param('workspaceId') workspaceId: string, @Param('websiteId') websiteId: string) {
    return this.websitesService.remove(workspaceId, websiteId);
  }
}
