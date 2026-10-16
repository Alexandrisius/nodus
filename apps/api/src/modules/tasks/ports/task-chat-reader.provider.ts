import { Injectable } from '@nestjs/common';
import type { TaskRef } from '@nodus/contracts';

import { PrismaService } from '../../../core/database/prisma.service.js';
import { ViewerResolver, visibleTasksWhere } from '../access/task-visibility.js';
import type { TaskChatReader, TaskChatRoster } from './task-chat-reader.port.js';

/** Реализация read-порта задач для чата (таблицы задач — только здесь). */
@Injectable()
export class TaskChatReaderProvider implements TaskChatReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewers: ViewerResolver,
  ) {}

  async roster(taskId: string): Promise<TaskChatRoster | null> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { creatorId: true, assigneeId: true, participants: true },
    });
    if (!task) return null;
    const members = new Map<string, boolean>([
      [task.creatorId, false],
      [task.assigneeId, false],
    ]);
    for (const p of task.participants) {
      if (!members.has(p.userId)) members.set(p.userId, p.role === 'observer');
    }
    return {
      creatorId: task.creatorId,
      members: [...members].map(([userId, muted]) => ({ userId, muted })),
    };
  }

  refs(taskIds: string[]): Promise<TaskRef[]> {
    if (taskIds.length === 0) return Promise.resolve([]);
    return this.prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, number: true, title: true },
    });
  }

  async canView(
    taskId: string,
    user: { id: string; permissions: readonly string[] },
  ): Promise<boolean> {
    const viewer = await this.viewers.resolve(user);
    const row = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, visibleTasksWhere(viewer, 'all')] },
      select: { id: true },
    });
    return row !== null;
  }
}
