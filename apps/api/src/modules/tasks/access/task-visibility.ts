import { Inject, Injectable } from '@nestjs/common';
import { Permission, type AuthUser } from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ORG_STRUCTURE_READER,
  type OrgStructureReader,
} from '../../../core/ports/org-structure.port.js';

/** Кто смотрит: id + права (из JWT) + подчинённые по оргструктуре. */
export interface Viewer {
  id: string;
  permissions: readonly string[];
  subordinateIds: readonly string[];
}

function involves(userIds: readonly string[]): Prisma.TaskWhereInput[] {
  return [
    { creatorId: { in: [...userIds] } },
    { assigneeId: { in: [...userIds] } },
    { participants: { some: { userId: { in: [...userIds] } } } },
  ];
}

/**
 * Единственная функция видимости задач (мини-спека #37) — на ВСЕ чтения:
 * список, деталь, ветка, поиск, счётчики, bulk. Видят: участники (постановщик,
 * ответственный, соисполнители, наблюдатели), их руководители по оргструктуре,
 * обладатели task.view_all (кроме конфиденциальных). scope=mine — только
 * собственное участие. Ступень 3 добавит ветку «видимые проекты».
 */
export function visibleTasksWhere(viewer: Viewer, scope: 'mine' | 'all'): Prisma.TaskWhereInput {
  const mine = involves([viewer.id]);
  if (scope === 'mine') return { deletedAt: null, OR: mine };
  const or: Prisma.TaskWhereInput[] = [...mine];
  if (viewer.subordinateIds.length > 0) or.push(...involves(viewer.subordinateIds));
  if (viewer.permissions.includes(Permission.TASK_VIEW_ALL)) or.push({ confidential: false });
  return { deletedAt: null, OR: or };
}

@Injectable()
export class ViewerResolver {
  constructor(@Inject(ORG_STRUCTURE_READER) private readonly org: OrgStructureReader) {}

  async resolve(user: Pick<AuthUser, 'id' | 'permissions'>): Promise<Viewer> {
    return {
      id: user.id,
      permissions: user.permissions,
      subordinateIds: await this.org.subordinateIds(user.id),
    };
  }
}
