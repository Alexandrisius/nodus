import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type {
  CustomFieldRef,
  CustomFieldValue,
  Paginated,
  TaskDetail,
  TaskListItem,
} from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api, ApiError } from '../../../shared/api-client.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { mapTaskInPages, taskDependentKeys, tasksKeys } from '../../../shared/api/tasks-keys.js';

/** Правка одного кастомного поля карточки (#431, I4): значение в детали и
 *  журналах меняется сразу, `null` удаляет ключ; ссылка выбора (имя, аватар)
 *  кладётся в `customFieldRefs` до ответа сервера (Р6). Откат — по снапшотам
 *  всех патчимых кэшей (канон patterns.md). */
export function useUpdateTaskCustomField(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      fieldId: string;
      value: CustomFieldValue | null;
      /** Ссылка выбора — для мгновенного показа имени (в тело не уходит). */
      refs?: readonly CustomFieldRef[];
    }) =>
      api<TaskListItem>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { customFields: { [vars.fieldId]: vars.value } },
      }),
    onMutate: async (vars) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) }),
        queryClient.cancelQueries({ queryKey: tasksKeys.listPages() }),
      ]);
      const previous = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      const previousPages = queryClient.getQueriesData<InfiniteData<Paginated<TaskListItem>>>({
        queryKey: tasksKeys.listPages(),
      });
      if (previous) {
        queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), {
          ...previous,
          customFields: patchedValues(previous.customFields, vars.fieldId, vars.value),
          customFieldRefs: mergedRefs(previous.customFieldRefs, vars.refs),
        });
      }
      queryClient.setQueriesData<InfiniteData<Paginated<TaskListItem>>>(
        { queryKey: tasksKeys.listPages() },
        (old) =>
          mapTaskInPages(old, taskId, (row) => ({
            ...row,
            customFields: patchedValues(row.customFields, vars.fieldId, vars.value),
          })),
      );
      return { previous, previousPages };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(tasksKeys.detail(taskId), context.previous);
      for (const [key, data] of context?.previousPages ?? []) queryClient.setQueryData(key, data);
      toast.error(fieldErrorText(error));
    },
    onSettled: () => {
      for (const key of taskDependentKeys(taskId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
    },
  });
}

/** Текст отказа: причина конкретного поля из `details.issues` (Р2) читается
 *  понятнее общего «не удалось сохранить». */
export function fieldErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code === ErrorCode.CUSTOM_FIELD_VALUE_INVALID) {
    const details = error.details as { issues?: Array<{ reason?: string }> } | undefined;
    const reason = details?.issues?.[0]?.reason;
    if (reason && reason in ui.customFields.issues) {
      return ui.customFields.issues[reason as keyof typeof ui.customFields.issues];
    }
  }
  if (error instanceof ApiError && error.code in errorMessages) {
    return errorMessages[error.code as ErrorCode];
  }
  return ui.common.saveError;
}

/** Значения с патчем: `null` удаляет ключ (пустое не хранится, Р1). */
export function patchedValues(
  values: Record<string, CustomFieldValue> | undefined,
  fieldId: string,
  value: CustomFieldValue | null,
): Record<string, CustomFieldValue> {
  const next = { ...(values ?? {}) };
  if (value === null) delete next[fieldId];
  else next[fieldId] = value;
  return next;
}

/** Ссылки выбора поверх прежних (по id: имя и архив обновляются). */
export function mergedRefs(
  refs: readonly CustomFieldRef[] | undefined,
  added: readonly CustomFieldRef[] | undefined,
): CustomFieldRef[] {
  if (!added || added.length === 0) return [...(refs ?? [])];
  const byId = new Map((refs ?? []).map((ref) => [ref.id, ref]));
  for (const ref of added) byId.set(ref.id, ref);
  return [...byId.values()];
}
