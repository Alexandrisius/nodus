import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomFieldBody,
  CustomFieldDefinition,
  ReorderCustomFieldsBody,
  UpdateCustomFieldBody,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { customFieldsKeys } from '../../../shared/custom-fields/queries.js';

type DefinitionLists = Array<[readonly unknown[], CustomFieldDefinition[]]>;

/** Все подгруженные списки определений (по областям/архиву) — оптимистичные
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

/** Создание поля — пессимистично (составная операция «справочник → поле»,
 *  id нужен редактору); ошибки (имя, лимит, тип) показывает диалог. */
export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomFieldBody) =>
      api<CustomFieldDefinition>('/custom-fields/definitions', { method: 'POST', body }),
    onSuccess: () => invalidate(queryClient),
  });
}

/** Правка определения: имя, подсказка, тип, настройки, умолчание, отчёты.
 *  Оптимистично с откатом; ошибку разбирает редактор (имя занято и пр.). */
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
  if (body.defaultValue !== undefined) patch.defaultValue = body.defaultValue;
  if (body.settings !== undefined) {
    patch.settings = { ...definition.settings, ...body.settings };
  }
  return patch;
}

/** Архив и возврат: значения сохраняются, поле скрывается из карточек,
 *  окон и фильтров (Р4). Оптимистично, идемпотентно. */
export function useArchiveCustomField(archived: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<CustomFieldDefinition>(
        `/custom-fields/definitions/${id}/${archived ? 'archive' : 'restore'}`,
        { method: 'POST' },
      ),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: customFieldsKeys.all });
      const previous = definitionLists(queryClient);
      patchLists(queryClient, (definition) =>
        definition.id === id
          ? { ...definition, archivedAt: archived ? new Date().toISOString() : null }
          : definition,
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
      toast.error(ui.common.saveError);
    },
    onSuccess: (definition) => {
      patchLists(queryClient, (current) => (current.id === definition.id ? definition : current));
    },
    onSettled: () => invalidate(queryClient),
  });
}

/** Порядок полей внутри области — перетаскиванием (ids = ровно активные). */
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
