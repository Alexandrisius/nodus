import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { tasksKeys } from './tasks-api.js';

/** Пункт чек-листа в карточке (I4): мгновенно в кэш детали, счётчики
 *  списочного элемента пересчитываются локально (их видит бейдж канбана). */
export function useAddChecklistItem(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (text: string) =>
      api<TaskDetail>(`/tasks/${taskId}/checklist`, { method: 'POST', body: { text } }),

    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      if (!previous) return { previous: undefined };
      const item = { id: `temp-${crypto.randomUUID()}`, text, done: false };
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), {
        ...previous,
        checklist: [...previous.checklist, item],
        checklistTotal: previous.checklistTotal + 1,
      });
      return { previous };
    },

    onError: (_error, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.detail(taskId), context.previous);
      }
      toast.error(ui.common.sendError);
    },

    onSuccess: (server) => {
      queryClient.setQueryData(tasksKeys.detail(taskId), server);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
    },
  });
}

/** Отметка выполнения пункта чек-листа (I4, оптимистично). */
export function useToggleChecklistItem(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      api<TaskDetail>(`/tasks/${taskId}/checklist/${itemId}`, {
        method: 'PATCH',
        body: { done },
      }),

    onMutate: async ({ itemId, done }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      if (!previous) return { previous: undefined };
      const checklist = previous.checklist.map((i) => (i.id === itemId ? { ...i, done } : i));
      queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), {
        ...previous,
        checklist,
        checklistDone: checklist.filter((i) => i.done).length,
      });
      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.detail(taskId), context.previous);
      }
      toast.error(ui.common.sendError);
    },

    onSuccess: (server) => {
      queryClient.setQueryData(tasksKeys.detail(taskId), server);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
    },
  });
}
