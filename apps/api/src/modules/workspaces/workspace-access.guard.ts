import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/jwt.types';

/**
 * Requires the JwtAuthGuard to have run first (request.user populated).
 * Verifies the authenticated user belongs to the workspace referenced by
 * the `:workspaceId` route param, and attaches `request.membership`.
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    const workspaceId = request.params?.workspaceId;

    if (!user) throw new ForbiddenException('Not authenticated');
    if (!workspaceId) throw new ForbiddenException('Missing workspaceId parameter');

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this workspace');
    }

    request.membership = membership;
    return true;
  }
}
