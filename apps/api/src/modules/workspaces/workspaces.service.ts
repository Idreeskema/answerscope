import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'workspace'}-${nanoid(6).toLowerCase()}`;
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
    });
    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  async create(userId: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name, slug: slugify(name) },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: 'OWNER' },
      });
      return workspace;
    });
  }

  async findOne(workspaceId: string) {
    return this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  }
}
