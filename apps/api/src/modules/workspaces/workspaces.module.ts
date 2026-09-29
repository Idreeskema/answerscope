import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceAccessGuard } from './workspace-access.guard';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceAccessGuard],
  exports: [WorkspacesService, WorkspaceAccessGuard],
})
export class WorkspacesModule {}
