import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TaskProjectReader } from './task-project-reader.port.js';

/**
 * Реализация read-порта TaskProjectReader: доступ к таблицам задач —
 * только здесь (I3/I6); наблюдатели задач в состав проекта не попадают
 * (вердикт 29.10 — зеркало involves() без participants-наблюдателей).
 */
@Injectable()
export class TaskProjectReaderProvider implements TaskProjectReader {
  constructor(private readonly prisma: PrismaService) {}

  async membersOf(projectId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT u.user_id FROM (
        SELECT creator_id AS user_id FROM tasks
        WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
        UNION
        SELECT assignee_id AS user_id FROM tasks
        WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
        UNION
        SELECT tp.user_id FROM task_participants tp
        JOIN tasks t ON t.id = tp.task_id
        WHERE t.project_id = ${projectId}::uuid AND t.deleted_at IS NULL
          AND tp.role = 'coexecutor'
      ) u
    `;
    return rows.map((row) => row.user_id);
  }

  async roleHolderIds(projectId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT u.user_id FROM (
        SELECT creator_id AS user_id FROM tasks
        WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
        UNION
        SELECT assignee_id AS user_id FROM tasks
        WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
        UNION
        SELECT tp.user_id FROM task_participants tp
        JOIN tasks t ON t.id = tp.task_id
        WHERE t.project_id = ${projectId}::uuid AND t.deleted_at IS NULL
      ) u
    `;
    return rows.map((row) => row.user_id);
  }

  async projectIdOf(taskId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ project_id: string | null }[]>`
      SELECT project_id FROM tasks
      WHERE id = ${taskId}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    return rows[0]?.project_id ?? null;
  }
}
