import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ErrorCode,
  ExecuteTransitionResult,
  TaskDetail,
  TaskListItem,
  TaskStage,
  TaskTransition,
  TransitionBlockReason,
} from '@nodus/contracts';
import { errorMessages, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api, ApiError } from '../../../shared/api-client.js';
import { markFreshFromMutation } from '../../../shared/api/fresh-from-mutation.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { mapTaskInPages, tasksKeys } from '../../../shared/api/tasks-keys.js';

/** Причины блокировки гейтов одной строкой (подпись кнопки и тост). */
export function gateReasonsText(reasons: readonly TransitionBlockReason[]): string {
  return reasons.map((r) => ui.tasks.gate[r.kind]).join('; ');
}

/** Текст ошибки переноса/перехода: гейт — его причины; «нет такой кнопки»
 *  — с именем текущего статуса (перенос в «Моём плане»); иначе русская
 *  строка по коду (I15) или общий фолбэк «вернули на прежнюю стадию». */
export function transitionErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const reasons = (error.details?.reasons ?? []) as TransitionBlockReason[];
    if (reasons.length > 0)
      return `${errorMessages[error.code as ErrorCode]}: ${gateReasonsText(reasons)}`;
    const from = error.details?.fromStageName;
    if (error.code === 'TASK_TRANSITION_NOT_ALLOWED' && typeof from === 'string') {
      return `${ui.tasks.transitionNotAllowedFrom} «${from}» ${ui.tasks.transitionNotAllowedTail}`;
    }
    const known = errorMessages[error.code as ErrorCode];
    if (known && error.code.startsWith('TASK_')) return known;
  }
  return ui.tasks.stageMoveError;
}

/** Доступные текущему пользователю переходы маршрута (ADR-0020): кнопки бара
 *  и список поля «Стадия» — сервер решает, кому какие (условия «кто»).
 *  Свежесть держат ответ кнопки и WS-события — без рефетча на каждый маунт. */
export function useTaskTransitions(taskId: string) {
  return useQuery({
    queryKey: tasksKeys.transitions(taskId),
    queryFn: () => api<TaskTransition[]>(`/tasks/${taskId}/transitions`),
    staleTime: 30_000,
  });
}

/** Стадия-цель кнопки — из самой кнопки (цвет/порядок в DTO): чип меняется
 *  мгновенно и без каталога стадий в кэше. */
function stageOf(t: TaskTransition, current: TaskStage): TaskStage {
  return {
    ...current,
    id: t.toStageId,
    name: t.toStageName,
    order: t.toStageOrder,
    systemState: t.toStageState,
    color: t.toStageColor,
    outcome: t.toStageOutcome,
  };
}

function patchTask(queryClient: QueryClient, taskId: string, patch: Partial<TaskListItem>) {
  queryClient.setQueryData<TaskDetail>(tasksKeys.detail(taskId), (prev) =>
    prev ? { ...prev, ...patch } : prev,
  );
  queryClient.setQueriesData({ queryKey: tasksKeys.listPages() }, (data) =>
    mapTaskInPages(data as Parameters<typeof mapTaskInPages>[0], taskId, (t) => ({
      ...t,
      ...patch,
    })),
  );
}

/** Выполнение перехода (I4): чип стадии и строка журнала меняются сразу;
 *  ответ сервера несёт строку задачи и НОВЫЕ кнопки — панель процесса
 *  обновляется одним ходом, без повторного GET. Доски/счётчики догоняет
 *  WS-эхо события (один пакет); здесь они только помечаются устаревшими. */
export function useExecuteTransition(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { transition: TaskTransition; override?: boolean; reason?: string }) =>
      api<ExecuteTransitionResult>(`/tasks/${taskId}/transitions/${vars.transition.id}`, {
        method: 'POST',
        body: { override: vars.override, reason: vars.reason },
      }),
    onMutate: async ({ transition }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.detail(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(tasksKeys.detail(taskId));
      if (previous) patchTask(queryClient, taskId, { stage: stageOf(transition, previous.stage) });
      return { previous };
    },
    onSuccess: (result) => {
      markFreshFromMutation(taskId);
      patchTask(queryClient, taskId, result.task);
      queryClient.setQueryData(tasksKeys.transitions(taskId), result.transitions);
    },
    onError: (error, _vars, context) => {
      if (context?.previous) patchTask(queryClient, taskId, { stage: context.previous.stage });
      toast.error(transitionErrorText(error));
    },
    onSettled: (_result, error) => {
      if (error) {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
        void queryClient.invalidateQueries({ queryKey: tasksKeys.transitions(taskId) });
      }
      // Без немедленного рефетча: активные доски и журнал перезапросит
      // WS-эхо одним пакетом, остальное — при следующем открытии.
      for (const key of [
        tasksKeys.listPages(),
        tasksKeys.kanbanAll(),
        tasksKeys.personalStages(),
        lettersKeys.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' });
      }
    },
  });
}
