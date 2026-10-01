/**
 * Read-порт членства бесед (ADR-0012): модуль notifications читает состав и
 * mute-флаги бесед для ярусного резолвера, не трогая таблицы чата (I3/I6).
 * Владелец данных — chat: реализация `membership-reader.provider.ts` здесь,
 * токен экспортируется через ChatPortsModule; доменные сервисы чата не
 * экспортируются никогда.
 */

export interface ChatMemberState {
  userId: string;
  /** Звук выключен: ярус понижается до background (ADR-0016 §3). */
  muted: boolean;
}

export interface ChatConversationState {
  type: 'direct' | 'group' | 'project_channel' | 'task' | 'letter';
  title: string | null;
  members: ChatMemberState[];
}

export const CHAT_MEMBERSHIP_READER = Symbol('CHAT_MEMBERSHIP_READER');

export interface ChatMembershipReader {
  /** Состав беседы с mute-флагами; null — беседы нет. */
  conversationState(conversationId: string): Promise<ChatConversationState | null>;

  /** Наблюдатели треда (автор корня/реплаи/подписчики/@упомянутые). */
  threadWatcherIds(threadRootId: string): Promise<string[]>;
}
