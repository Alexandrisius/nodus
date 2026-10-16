/**
 * API-слой чата в shared (два потребителя — мессенджер и вкладка «Чат»
 * панели проекта; I6: фичи друг друга не импортируют). Ключи — единая
 * фабрика: инвалидации пересекают границы потребителей.
 */
export const chatKeys = {
  all: ['chat'] as const,
  conversations: () => [...chatKeys.all, 'conversations'] as const,
  messages: (id: string) => [...chatKeys.all, 'messages', id] as const,
  thread: (id: string, rootId: string) =>
    [...chatKeys.all, 'messages', id, 'thread', rootId] as const,
  /** Закрепы беседы (A3): лента закрепов снапшотами. */
  pins: (id: string) => [...chatKeys.all, 'pins', id] as const,
  /** Состояния трэдов для текущего пользователя (раунд 3: точка «есть новые»
   *  на посте, кнопка «Следить»); под префиксом messages(id) НЕ живёт —
   *  инвалидация ленты его не трогает. */
  threadStates: (id: string) => [...chatKeys.all, 'threadStates', id] as const,
  /** Личка с пользователем (открыть/создать direct по сотруднику). */
  direct: (userId: string) => [...chatKeys.conversations(), 'direct', userId] as const,
  /** Беседа задачи (#252): find-or-create по задаче для карточки. */
  byTask: (taskId: string) => [...chatKeys.conversations(), 'task', taskId] as const,
  /** Вкладка мессенджера (#252): серверный фильтр и своя пагинация; под
   *  префиксом conversations() — общие инвалидации списка её достают. */
  scoped: (scope: ConversationScope) => [...chatKeys.conversations(), 'scope', scope] as const,
  /** Участники беседы (#186): панель с ролями; search — часть ключа. */
  members: (id: string) => [...chatKeys.all, 'members', id] as const,
  /** Политика важных (#177): счётчик дневного лимита попапа молнии. */
  urgentPolicy: () => [...chatKeys.all, 'urgentPolicy'] as const,
};

export type ConversationScope = 'chats' | 'entities';
