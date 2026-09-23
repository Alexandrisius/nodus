import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDepartmentDto,
  Department,
  DepartmentNode,
  OrgUnitKind,
  PresenceEntry,
  UpdateDepartmentDto,
  UserCard,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { insertDepartment, patchDepartment } from '../lib/department-tree.js';

// Канонический хук справочника людей — shared (единый ключ/кэш); реэкспорт
// для обратной совместимости импортов фичи.
export { useUsersList } from '../../../shared/api/users-list.js';

export const directoryKeys = {
  all: ['directory'] as const,
  users: () => [...directoryKeys.all, 'users'] as const,
  userCard: (id: string) => [...directoryKeys.all, 'user', id] as const,
  presence: () => [...directoryKeys.all, 'presence'] as const,
  departments: (kind: OrgUnitKind) => [...directoryKeys.all, 'departments', kind] as const,
};

/**
 * Дерево оргструктуры вида (контракт GET /directory/departments?kind=, #84):
 * лес корней DepartmentNode. Вид «Подразделения» и панель рисуются из него;
 * бэкенд-агент воспроизводит эндпоинт по контракту и мокам.
 */
export function useDepartmentTree(kind: OrgUnitKind) {
  return useQuery({
    queryKey: directoryKeys.departments(kind),
    queryFn: () => api<DepartmentNode[]>(`/directory/departments?kind=${kind}`),
  });
}

/** Создание подразделения: оптимистичная вставка узла в дерево вида (I4) —
 *  карточка появляется до ответа, откат при ошибке; имена руководителя/зама
 *  и счётчики доносит инвалидация после ответа. */
export function useCreateDepartment(kind: OrgUnitKind) {
  const queryClient = useQueryClient();
  const key = directoryKeys.departments(kind);
  return useMutation({
    mutationFn: (body: CreateDepartmentDto) =>
      api<Department>('/directory/departments', { method: 'POST', body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DepartmentNode[]>(key);
      const temp: DepartmentNode = {
        id: `temp-${crypto.randomUUID()}`,
        name: body.name,
        kind: body.kind ?? kind,
        parentId: body.parentId ?? null,
        headId: body.headId ?? null,
        deputyId: body.deputyId ?? null,
        sortOrder: body.sortOrder ?? 0,
        isActive: true,
        headName: null,
        deputyName: null,
        memberCount: 0,
        children: [],
      };
      if (previous) queryClient.setQueryData(key, insertDepartment(previous, temp));
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(ui.common.saveError);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Правка подразделения (название/руководитель/зам): оптимистичный патч узла (I4). */
export function useUpdateDepartment(kind: OrgUnitKind) {
  const queryClient = useQueryClient();
  const key = directoryKeys.departments(kind);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDepartmentDto }) =>
      api<Department>(`/directory/departments/${id}`, { method: 'PATCH', body: patch }),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DepartmentNode[]>(key);
      if (previous) queryClient.setQueryData(key, patchDepartment(previous, id, patch));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(ui.common.saveError);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Полная карточка сотрудника (UserCard) — вкладка «Профиль». */
export function useUserCard(id: string) {
  return useQuery({
    queryKey: directoryKeys.userCard(id),
    queryFn: () => api<UserCard>(`/directory/users/${id}`),
  });
}

export function usePresence() {
  return useQuery({
    queryKey: directoryKeys.presence(),
    queryFn: () => api<PresenceEntry[]>('/directory/presence'),
  });
}
