import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskDetail, TaskListItem, TaskParticipantAddBody } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { chatKeys } from '../../../shared/chat/chat-keys.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';

/** Состав задачи поменялся: деталь — ответом сервера, доски/списки и чат
 *  задачи (состав беседы = участники, #252) — инвалидацией. */
function useSettle(taskId: string) {
  const queryClient = useQueryClient();
  return (detail?: TaskDetail | null) => {
    if (detail) queryClient.setQueryData(tasksKeys.detail(taskId), detail);
    void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
    void queryClient.invalidateQueries({ queryKey: tasksKeys.listPages() });
    void queryClient.invalidateQueries({ queryKey: tasksKeys.kanbanAll() });
    void queryClient.invalidateQueries({ queryKey: chatKeys.byTask(taskId) });
  };
}

/** Соисполнитель/наблюдатель (или смена роли участника) — права на сервере. */
export function useAddTaskParticipant(taskId: string) {
  const settle = useSettle(taskId);
  return useMutation({
    mutationFn: (body: TaskParticipantAddBody) =>
      api<TaskDetail>(`/tasks/${taskId}/participants`, { method: 'POST', body }),
    onSuccess: (detail) => settle(detail),
    onError: () => toast.error(ui.common.saveError),
  });
}

/** Снять участника (наблюдатель может снять себя; null — задача больше не видна). */
export function useRemoveTaskParticipant(taskId: string) {
  const settle = useSettle(taskId);
  return useMutation({
    mutationFn: (userId: string) =>
      api<TaskDetail | null>(`/tasks/${taskId}/participants/${userId}`, { method: 'DELETE' }),
    onSuccess: (detail) => settle(detail),
    onError: () => toast.error(ui.common.saveError),
  });
}

/** Смена ответственного. */
export function useSetTaskAssignee(taskId: string) {
  const settle = useSettle(taskId);
  return useMutation({
    mutationFn: (assigneeId: string) =>
      api<TaskListItem>(`/tasks/${taskId}`, { method: 'PATCH', body: { assigneeId } }),
    onSuccess: () => settle(),
    onError: () => toast.error(ui.common.saveError),
  });
}
