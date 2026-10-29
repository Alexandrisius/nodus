import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NodeLevel, NodeLevelCreateBody, NodeLevelUpdateBody } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../../shared/api-client.js';
import { toastApiError } from '../../../../shared/api/error-toast.js';
import { projectsKeys } from '../../../../shared/api/projects-list.js';
import { structureKeys } from './structure-api.js';

/** Справочник видов уровней (#467): ярлыки узлов (значок + цвет), живёт в
 *  «Автоматизации» рядом с типами проектов. Архив — не удаление: узлы
 *  архивного вида живут, новые создавать нельзя. */

type QueryClient = ReturnType<typeof useQueryClient>;
const levelsPrefix = [...projectsKeys.all, 'node-levels'] as const;

export function useNodeLevels(includeArchived = false) {
  return useQuery({
    queryKey: structureKeys.nodeLevels(includeArchived),
    queryFn: () => api<NodeLevel[]>(`/projects/node-levels?includeArchived=${includeArchived}`),
  });
}

function patchLevels(queryClient: QueryClient, update: (levels: NodeLevel[]) => NodeLevel[]) {
  queryClient.setQueriesData<NodeLevel[]>({ queryKey: levelsPrefix }, (data) =>
    data ? update(data) : data,
  );
}

function levelsSnapshot(queryClient: QueryClient) {
  return queryClient.getQueriesData<NodeLevel[]>({ queryKey: levelsPrefix });
}

function restore(queryClient: QueryClient, snapshot: ReturnType<typeof levelsSnapshot>) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

function invalidateLevels(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: levelsPrefix });
  // Виды уровней вшиты в ответ структуры — дерево перекрасится тоже.
  void queryClient.invalidateQueries({ queryKey: [...projectsKeys.all, 'structure'] });
}

export function useCreateNodeLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NodeLevelCreateBody) =>
      api<NodeLevel>('/projects/node-levels', { method: 'POST', body }),
    onMutate: async (body) => {
      const snapshot = levelsSnapshot(queryClient);
      const temp: NodeLevel = { id: `temp-${crypto.randomUUID()}`, archivedAt: null, ...body };
      patchLevels(queryClient, (levels) => [...levels, temp]);
      return { snapshot, tempId: temp.id };
    },
    onError: (error, _body, context) => {
      restore(queryClient, context?.snapshot ?? []);
      toastApiError(error);
    },
    onSuccess: (level, _body, context) => {
      patchLevels(queryClient, (levels) =>
        levels.map((entry) => (entry.id === context?.tempId ? level : entry)),
      );
      toast.success(ui.projects.savedDone);
    },
    onSettled: () => invalidateLevels(queryClient),
  });
}

export function useUpdateNodeLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string } & NodeLevelUpdateBody) => {
      const { id, ...body } = vars;
      return api<NodeLevel>(`/projects/node-levels/${id}`, { method: 'PATCH', body });
    },
    onMutate: async (vars) => {
      const snapshot = levelsSnapshot(queryClient);
      patchLevels(queryClient, (levels) =>
        levels.map((entry) =>
          entry.id === vars.id
            ? {
                ...entry,
                ...(vars.name !== undefined ? { name: vars.name } : {}),
                ...(vars.icon !== undefined ? { icon: vars.icon } : {}),
                ...(vars.color !== undefined ? { color: vars.color } : {}),
              }
            : entry,
        ),
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      restore(queryClient, context?.snapshot ?? []);
      toastApiError(error);
    },
    onSuccess: () => toast.success(ui.projects.savedDone),
    onSettled: () => invalidateLevels(queryClient),
  });
}

/** Архивация вида (возврата нет — как у системных справочников; новые узлы
 *  архивного вида создавать нельзя, существующие живут). */
export function useArchiveNodeLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<NodeLevel>(`/projects/node-levels/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      const snapshot = levelsSnapshot(queryClient);
      patchLevels(queryClient, (levels) =>
        levels.map((entry) =>
          entry.id === id ? { ...entry, archivedAt: new Date().toISOString() } : entry,
        ),
      );
      return { snapshot };
    },
    onError: (error, _id, context) => {
      restore(queryClient, context?.snapshot ?? []);
      toastApiError(error);
    },
    onSuccess: () => toast.success(ui.projects.savedDone),
    onSettled: () => invalidateLevels(queryClient),
  });
}
