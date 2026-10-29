import { Inject, Injectable } from '@nestjs/common';
import { Permission, type AuthUser } from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import {
  ORG_STRUCTURE_READER,
  type OrgStructureReader,
} from '../../../core/ports/org-structure.port.js';
import { PROJECT_READER, type ProjectReader } from '../../projects/ports/project-reader.port.js';

/** Кто смотрит: id + права (из JWT) + подчинённые по оргструктуре +
 *  множества проектов (Р3: видимые — задачи открытых и моих секретных). */
export interface Viewer {
  id: string;
  permissions: readonly string[];
  subordinateIds: readonly string[];
  visibleProjectIds: readonly string[];
  hiddenProjectIds: readonly string[];
}

function involves(userIds: readonly string[]): Prisma.TaskWhereInput[] {
  return [
    { creatorId: { in: [...userIds] } },
    { assigneeId: { in: [...userIds] } },
    { participants: { some: { userId: { in: [...userIds] } } } },
  ];
}

/** Гейт «не из скрытых секретных проектов»: null — скрытых нет, фильтр не
 *  нужен. Ветка `IS NULL` обязательна: SQL `NULL NOT IN (...)` ложен, без
 *  неё задачи без проекта пропадают (ловушка Р3). */
function notHiddenProjectIds(hidden: readonly string[]): Prisma.TaskWhereInput | null {
  if (hidden.length === 0) return null;
  return { OR: [{ projectId: null }, { projectId: { notIn: [...hidden] } }] };
}

/**
 * Единственная функция видимости задач (мини-спека #37) — на ВСЕ чтения:
 * список, деталь, ветка, поиск, счётчики, bulk. Видят: участники (постановщик,
 * ответственный, соисполнители, наблюдатели), их руководители по оргструктуре,
 * задачи видимых проектов (открытые + секретные моего участия, #52 Р3),
 * обладатели task.view_all — все задачи, кроме секретных проектов без своего
 * участия (админы секретных не видят, вердикт 29.10). scope=mine — только
 * собственное участие. Подчинённые секретные проекты не раскрывают: их
 * ветка гейтится скрытыми проектами.
 */
export function visibleTasksWhere(viewer: Viewer, scope: 'mine' | 'all'): Prisma.TaskWhereInput {
  const mine = involves([viewer.id]);
  if (scope === 'mine') return { deletedAt: null, OR: mine };
  const or: Prisma.TaskWhereInput[] = [...mine];
  if (viewer.subordinateIds.length > 0) {
    const subordinateTasks: Prisma.TaskWhereInput = { OR: involves(viewer.subordinateIds) };
    // Подчинённый — участник секретного проекта не раскрывает его задачи
    // начальнику: ветка гейтится скрытыми проектами (Т1).
    const gate = notHiddenProjectIds(viewer.hiddenProjectIds);
    or.push(gate ? { AND: [subordinateTasks, gate] } : subordinateTasks);
  }
  if (viewer.visibleProjectIds.length > 0) {
    or.push({ projectId: { in: [...viewer.visibleProjectIds] } });
  }
  if (viewer.permissions.includes(Permission.TASK_VIEW_ALL)) {
    // Не ранний return: task.view_all не открывает чужие секретные проекты
    // (Т1) — гейт скрытых остаётся и у админа.
    const gate = notHiddenProjectIds(viewer.hiddenProjectIds);
    return gate ? { deletedAt: null, AND: [gate] } : { deletedAt: null };
  }
  return { deletedAt: null, OR: or };
}

@Injectable()
export class ViewerResolver {
  constructor(
    @Inject(ORG_STRUCTURE_READER) private readonly org: OrgStructureReader,
    @Inject(PROJECT_READER) private readonly projects: ProjectReader,
  ) {}

  async resolve(user: { id: AuthUser['id']; permissions: readonly string[] }): Promise<Viewer> {
    const [subordinateIds, scope] = await Promise.all([
      this.org.subordinateIds(user.id),
      this.projects.viewScopeFor(user),
    ]);
    return {
      id: user.id,
      permissions: user.permissions,
      subordinateIds,
      visibleProjectIds: scope.visibleProjectIds,
      hiddenProjectIds: scope.hiddenProjectIds,
    };
  }
}
