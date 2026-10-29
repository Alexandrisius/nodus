import { Injectable } from '@nestjs/common';
import type { ProjectHistoryKind } from '@nodus/contracts';

import { PrismaService } from '../../core/database/prisma.service.js';

const PROJECT_EVENT_KINDS: Record<string, ProjectHistoryKind> = {
  'project.created': 'created',
  'project.updated': 'updated',
  'project.participants_changed': 'participants_changed',
};

/** Строка журнала событий агрегата проекта (outbox, I9). */
export interface ProjectEventRow {
  id: string;
  type: string;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
  seq: bigint;
}

/**
 * Чтение истории проекта из журнала событий (I9): лента вкладки «История»
 * не заводит своей таблицы — источник истины уже пишется outbox'ом в той же
 * транзакции, что и изменение. Ключ курсора — монотонный `seq` (события
 * одного проекта упорядочены глобальной последовательностью).
 */
@Injectable()
export class ProjectHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Страница событий агрегата (новые первыми), keyset по `seq`. */
  async findPage(
    projectId: string,
    after: bigint | null,
    limit: number,
  ): Promise<ProjectEventRow[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        aggregateType: 'project',
        aggregateId: projectId,
        type: { in: Object.keys(PROJECT_EVENT_KINDS) },
        ...(after === null ? {} : { seq: { lt: after } }),
      },
      select: { id: true, type: true, actorId: true, payload: true, createdAt: true, seq: true },
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });
    return rows;
  }
}

export { PROJECT_EVENT_KINDS };
