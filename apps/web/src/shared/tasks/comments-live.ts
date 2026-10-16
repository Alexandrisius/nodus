import { create } from 'zustand';

/**
 * Живой счётчик комментариев задачи (#252, канон счётчика ответов треда):
 * сообщение в беседе задачи даёт +1 сразу по `chat.message_sent` (удаление —
 * −1), точное серверное значение приходит событием `task.comments_counted`
 * (~1 с, пересчёт) и снимает локальную дельту. Кэши досок/списков не
 * трогаются: борд держит свои подгруженные страницы, рефеч на каждое
 * сообщение в чате на сотни строк был бы лишней нагрузкой.
 */
interface CommentsLiveState {
  exact: Record<string, number>;
  delta: Record<string, number>;
  setExact: (taskId: string, count: number) => void;
  bump: (taskId: string, by: number) => void;
}

/** Уже учтённые сообщения (повторная доставка/свой и чужой сокет). */
const seen = new Set<string>();
const SEEN_MAX = 1000;

export const useCommentsLive = create<CommentsLiveState>((set) => ({
  exact: {},
  delta: {},
  setExact: (taskId, count) =>
    set((s) => {
      const delta = { ...s.delta };
      delete delta[taskId];
      return { exact: { ...s.exact, [taskId]: count }, delta };
    }),
  bump: (taskId, by) =>
    set((s) =>
      s.exact[taskId] !== undefined
        ? { exact: { ...s.exact, [taskId]: Math.max(0, (s.exact[taskId] ?? 0) + by) } }
        : { delta: { ...s.delta, [taskId]: (s.delta[taskId] ?? 0) + by } },
    ),
}));

/** Учесть сообщение один раз (ключ — событие + id сообщения). */
export function bumpCommentsOnce(taskId: string, key: string, by: number): void {
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string);
  useCommentsLive.getState().bump(taskId, by);
}

/** Отображаемое число комментариев задачи. */
export function useCommentsCount(task: { id: string; commentsCount: number }): number {
  return useCommentsLive((s) => {
    const exact = s.exact[task.id];
    return exact ?? Math.max(0, task.commentsCount + (s.delta[task.id] ?? 0));
  });
}
