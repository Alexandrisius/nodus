import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ErrorCode,
  TaskDetail,
  TaskListItem,
  TaskStage,
  TaskTransition,
  TransitionBlockReason,
} from '@nodus/contracts';
import { errorMessages, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api, ApiError } from '../../../shared/api-client.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';

/** Причины блокировки гейтов одной строкой (подпись кнопки и тост). */
export function gateReasonsText(reasons: readonly TransitionBlockReason[]): string {
  return reasons.map((r) => ui.tasks.gate[r.kind]).join('; ');
}

/** Текст ошибки переноса/перехода: гейт — его причины, маршрут — русская
 *  строка по коду (I15), иначе общий фолбэк «вернули на прежнюю стадию». */
export function transitionErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const reasons = (error.details?.reasons ?? []) as TransitionBlockReason[];
    if (reasons.length > 0)
      return `${errorMessages[error.code as ErrorCode]}: ${gateReasonsText(reasons)}`;
    const known = errorMessages[error.code as ErrorCode];
    if (known && error.code.startsWith('TASK_')) return known;
  }
  return ui.tasks.stageMoveError;
}

/** Доступные текущему пользователю переходы маршрута (ADR-0020): кнопки бара
 *  и список поля «Стадия» — сервер решает, кому какие (условия «кто»). */
export function useTaskTransitions(taskId: string) {
  return useQuery({
    queryKey: tasksKeys.transitions(taskId),
    queryFn: () => api<TaskTransition[]>(`/tasks/${taskId}/transitions`),
  });
}

/** Выполнение перехода (I4: стадия в карточке меняется сразу, откат — по
 *  снапшоту; доски и счётчики пересобираются инвалидацией). */
export function useExecuteTransition(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { transition: TaskTransition; override?: boolean; reason?: string }) =>
      api<TaskListItem>(`/tasks/${taskId}/transitions/${vars.transition.id}`, {
        method: 'POST',
        body: { override: vars.override, reason: vars.reason },
      }),
    onMutate: async ({ transition }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      const stage = queryClient
        .getQueryData<TaskStage[]>(tasksKeys.stages())
        ?.find((s) => s.id === transition.toStageId);
      if (previous && stage) {
        queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), { ...previous, stage });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(tasksKeys.detail(taskId), context.previous);
      toast.error(transitionErrorText(error));
    },
    onSettled: () => {
      for (const key of [
        tasksKeys.detail(taskId),
        tasksKeys.transitions(taskId),
        tasksKeys.listPages(),
        tasksKeys.kanbanAll(),
        tasksKeys.personalStages(),
        tasksKeys.stages(),
        lettersKeys.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
