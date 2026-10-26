import { useQuery } from '@tanstack/react-query';
import type { Paginated, ProjectListItem } from '@nodus/contracts';

import { api } from '../api-client.js';

/**
 * Обратные связи карточки контрагента (вкладки «Письма»/«Проекты», #460).
 * Живут в shared/api: потребитель — features/crm, а I6 запрещает фичам
 * импортировать друг друга. Письма контрагента — общий `useLettersInfinite`
 * (`letters-list.ts`, `?counterpartyId=`), проекты заказчика — здесь (`?clientId=`).
 */

export const counterpartyRelationsKeys = {
  projects: (counterpartyId: string) => ['projects', 'client', counterpartyId] as const,
};

/** Проекты, где контрагент — заказчик (GET /projects?clientId=). `enabled:
 *  false` — пока модуля проектов нет (#52), запрос не уходит. */
export function useClientProjects(counterpartyId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: counterpartyRelationsKeys.projects(counterpartyId),
    queryFn: () =>
      api<Paginated<ProjectListItem>>(`/projects?clientId=${counterpartyId}&limit=100`),
    enabled: options.enabled ?? true,
  });
}
