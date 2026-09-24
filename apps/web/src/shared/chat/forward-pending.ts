import type { ChatMessage, ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { create } from 'zustand';

/**
 * «Пересылка ждёт отправки» (A7, #87; переделка по вердикту владельца 24.09:
 * модель Bitrix24). Пикер выбирает ОДНОГО получателя (массовой рассылки нет —
 * «зачем нам спам»: несколько сообщений одному — да, несколько получателей —
 * нет), диалог закрывается, а в композере получателя встаёт бар пересылки:
 * текст поля становится комментарием и уходит вместе с блоком на отправке.
 * Бар живёт per-scope композера (как черновики), НЕ персистится (как
 * вложения черновика: после F5 пересылка не восстанавливается).
 */

export interface ForwardPending {
  /** focusId композера-получателя (`conversation:` / `feed:` / `thread:`). */
  scopeKey: string;
  conversationId: string;
  threadRootId: string | null;
  sourceConversationId: string;
  messageIds: string[];
  /** «От: …» — авторы оригиналов (атрибуция обязательна, тумблеров нет). */
  fromLabel: string;
}

interface ForwardPendingState {
  pendings: Record<string, ForwardPending>;
  set: (pending: ForwardPending) => void;
  clear: (scopeKey: string) => void;
}

export const useForwardPending = create<ForwardPendingState>((set) => ({
  pendings: {},
  set: (pending) => set((s) => ({ pendings: { ...s.pendings, [pending.scopeKey]: pending } })),
  clear: (scopeKey) =>
    set((s) => {
      if (!(scopeKey in s.pendings)) return s;
      const pendings = { ...s.pendings };
      delete pendings[scopeKey];
      return { pendings };
    }),
}));

/** Бар пересылки для композера scope (null — обычной отправки достаточно). */
export function pendingFor(scopeKey: string): ForwardPending | null {
  return useForwardPending.getState().pendings[scopeKey] ?? null;
}

/** focusId композера-получателя: тред → `thread:`, канал → лента `feed:`,
 *  остальные беседы → `conversation:` (ключи совпадают с chat-drafts). */
export function forwardScopeKey(
  conversation: ConversationListItem,
  threadRootId: string | null,
): string {
  if (threadRootId !== null) return `thread:${threadRootId}`;
  return conversation.type === 'project_channel'
    ? `feed:${conversation.id}`
    : `conversation:${conversation.id}`;
}

/** Авторы оригиналов в порядке выделения: «Вы, Полина Винничер»; больше двух
 *  — первые два и «+N» (бар компактный, реф строки «От:» Bitrix24). */
export function forwardFromLabel(
  messageIds: string[],
  messages: ChatMessage[] | undefined,
  meId: string | undefined,
): string {
  const byId = new Map((messages ?? []).map((m) => [m.id, m]));
  const names: string[] = [];
  for (const id of messageIds) {
    const author = byId.get(id)?.author;
    if (!author) continue;
    const name = author.id === meId ? ui.common.you : author.displayName;
    if (!names.includes(name)) names.push(name);
  }
  const head = names.slice(0, 2);
  return names.length > 2 ? `${head.join(', ')} +${names.length - 2}` : head.join(', ');
}
