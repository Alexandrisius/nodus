import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomFieldBody,
  CustomFieldDefinition,
  CustomFieldUsage,
  ReorderCustomFieldsBody,
  UpdateCustomFieldBody,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { customFieldsKeys } from '../../../shared/custom-fields/queries.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';

type DefinitionLists = Array<[readonly unknown[], CustomFieldDefinition[]]>;

/** Все подгруженные списки определений (по областям) — оптимистичные
 *  правки бьют в каждый, как списки задач в журнале. */
function definitionLists(queryClient: ReturnType<typeof useQueryClient>): DefinitionLists {
  return queryClient.getQueriesData<CustomFieldDefinition[]>({
    queryKey: customFieldsKeys.all,
  }) as DefinitionLists;
}

function patchLists(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: (definition: CustomFieldDefinition) => CustomFieldDefinition,
): void {
  for (const [key, data] of definitionLists(queryClient)) {
    if (!data) continue;
    queryClient.setQueryData(
      key,
      data.map((definition) => patch(definition)),
    );
  }
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: customFieldsKeys.all });
}

/** Создание атрибута — пессимистично (составная операция «справочник →
 *  атрибут»); ошибки (имя, лимит, тип) показывает окно. */
export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomFieldBody) =>
      api<CustomFieldDefinition>('/custom-fields/definitions', { method: 'POST', body }),
    onSuccess: () => invalidate(queryClient),
  });
}

/** Правка определения: имя, подсказка, тип, настройки, умолчание,
 *  видимость, отчёты. Оптимистично с откатом; ошибку разбирает вызывающий. */
export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateCustomFieldBody }) =>
      api<CustomFieldDefinition>(`/custom-fields/definitions/${vars.id}`, {
        method: 'PATCH',
        body: vars.body,
      }),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: customFieldsKeys.all });
      const previous = definitionLists(queryClient);
      patchLists(queryClient, (definition) =>
        definition.id === id ? { ...definition, ...patchOf(definition, body) } : definition,
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (definition) => {
      patchLists(queryClient, (current) => (current.id === definition.id ? definition : current));
    },
    onSettled: () => invalidate(queryClient),
  });
}

/** Поля тела правки → форма определения (сервер вернёт истину после ответа). */
function patchOf(
  definition: CustomFieldDefinition,
  body: UpdateCustomFieldBody,
): Partial<CustomFieldDefinition> {
  const patch: Partial<CustomFieldDefinition> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.hint !== undefined) patch.hint = body.hint;
  if (body.type !== undefined) patch.type = body.type;
  if (body.reportIndexed !== undefined) patch.reportIndexed = body.reportIndexed;
  if (body.hidden !== undefined) patch.hidden = body.hidden;
  if (body.defaultValue !== undefined) patch.defaultValue = body.defaultValue;
  if (body.settings !== undefined) {
    patch.settings = { ...definition.settings, ...body.settings };
  }
  if (body.typeIds !== undefined) patch.typeIds = body.typeIds;
  return patch;
}

/** Где используется атрибут (окно удаления): число заполненных карточек и
 *  маршруты процессов — непустые маршруты блокируют удаление. Без кэша:
 *  окно всегда проверяет свежую картину. */
export function useCustomFieldUsage(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      // Свой префикс, не customFieldsKeys.all: оптимистичные правки
      // перебирают кэши «all» как массивы определений.
      queryKey: ['custom-field-usage', id] as const,
      queryFn: () => api<CustomFieldUsage>(`/custom-fields/definitions/${id}/usage`),
      staleTime: 0,
      gcTime: 0,
    })),
  });
}

/** Удаление атрибутов (одного или пачки): пессимистично — необратимо, и
 *  сервер может отказать (CUSTOM_FIELD_IN_USE). Значения стираются вместе
 *  с определением; карточки перечитываются по инвалидации задач. */
export function useDeleteCustomFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api<void>(`/custom-fields/definitions/${id}`, { method: 'DELETE' })),
      );
      return results.filter((result) => result.status === 'fulfilled').length;
    },
    onSettled: () => {
      invalidate(queryClient);
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

/** Порядок атрибутов области (ids = ровно все атрибуты области). */
export function useReorderCustomFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReorderCustomFieldsBody) =>
      api<void>('/custom-fields/definitions/order', { method: 'PUT', body }),
    onMutate: async ({ scope, ids }) => {
      await queryClient.cancelQueries({ queryKey: customFieldsKeys.all });
      const previous = definitionLists(queryClient);
      const order = new Map(ids.map((id, index) => [id, index]));
      patchLists(queryClient, (definition) =>
        definition.scope === scope && order.has(definition.id)
          ? { ...definition, sortOrder: order.get(definition.id)! }
          : definition,
      );
      return { previous };
    },
    onError: (_error, _body, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
      toast.error(ui.common.saveError);
    },
    onSettled: () => invalidate(queryClient),
  });
}

/**
 * Привязка атрибута к типу процесса (#432, Р8): оптимистично (I4) и по
 * очереди на атрибут (`scope`): два быстрых клика по разным типам не
 * перетирают список друг друга. Снятие привязки сервер может отклонить
 * (409 CUSTOM_FIELD_IN_USE) — откат и текст ошибки из окна.
 */
export function useBindFieldType(fieldId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `field-types:${fieldId}` },
    mutationFn: (typeId: string) =>
      api<CustomFieldDefinition>(`/custom-fields/definitions/${fieldId}/types/${typeId}`, {
        method: 'PUT',
      }),
    onMutate: async (typeId) => {
      await queryClient.cancelQueries({ queryKey: customFieldsKeys.all });
      const previous = definitionLists(queryClient);
      patchLists(queryClient, (definition) =>
        definition.id === fieldId && !definition.typeIds.includes(typeId)
          ? { ...definition, typeIds: [...definition.typeIds, typeId] }
          : definition,
      );
      return { previous };
    },
    onError: (_error, _typeId, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (definition) => {
      patchLists(queryClient, (current) => (current.id === definition.id ? definition : current));
    },
    onSettled: () => invalidate(queryClient),
  });
}

/** Снятие привязки атрибута к типу (#432): оптимистично; 409 — откат. */
export function useUnbindFieldType(fieldId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `field-types:${fieldId}` },
    mutationFn: (typeId: string) =>
      api<CustomFieldDefinition>(`/custom-fields/definitions/${fieldId}/types/${typeId}`, {
        method: 'DELETE',
      }),
    onMutate: async (typeId) => {
      await queryClient.cancelQueries({ queryKey: customFieldsKeys.all });
      const previous = definitionLists(queryClient);
      patchLists(queryClient, (definition) =>
        definition.id === fieldId
          ? { ...definition, typeIds: definition.typeIds.filter((id) => id !== typeId) }
          : definition,
      );
      return { previous };
    },
    onError: (_error, _typeId, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (definition) => {
      patchLists(queryClient, (current) => (current.id === definition.id ? definition : current));
    },
    onSettled: () => invalidate(queryClient),
  });
}
