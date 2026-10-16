import type { InjectionToken } from '@nestjs/common';

/**
 * Порт чтения оргструктуры (ADR-0012): модулю задач нужно «кто мои
 * подчинённые» для видимости задач (канон Битрикса: руководитель видит
 * задачи подчинённых), но users/departments принадлежат directory — прямой
 * доступ из чужих репозиториев запрещён (I3/I6). Первый потребитель — tasks
 * (#37); реализация — core/ports/org-structure.provider.ts.
 */
export interface OrgStructureReader {
  /** Все подчинённые сотрудника (без него самого): по цепочке прямых
   *  руководителей (manager_id вниз на любую глубину) и члены подразделений
   *  (с дочерними), где он руководитель или заместитель. */
  subordinateIds(userId: string): Promise<string[]>;
}

export const ORG_STRUCTURE_READER: InjectionToken = 'ORG_STRUCTURE_READER';
