import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

/**
 * Группировка ленты на серии (план docs/mvp/chat-messages-plan.md, вердикт
 * владельца 14.09.2026, канон Телеграма/Битрикс24): подряд идущие сообщения
 * одного автора — одна серия (run). В серии: имя — только у первого чужого
 * сообщения, аватар и хвостик пузыря — только у последнего. Серия рвётся
 * ТОЛЬКО по смене автора или смене календарного дня (UTC-дата `createdAt`);
 * временного порога внутри дня НЕТ. Реакции, вложения, правки, цитаты и
 * оптимистичные (pending) сообщения серию не рвут. Чистые функции —
 * детерминированные unit-тесты без DOM.
 */
export interface MessageRun {
  authorId: string;
  mine: boolean;
  /** Первое сообщение серии — несёт имя автора (чужое, в групповых). */
  first: ChatMessage;
  /** Последнее сообщение серии — несёт аватар и хвостик пузыря. */
  last: ChatMessage;
  items: ChatMessage[];
}

const utcDay = (iso: string): string => iso.slice(0, 10);

export function buildMessageRuns(messages: ChatMessage[], meId?: string): MessageRun[] {
  const runs: MessageRun[] = [];
  for (const message of messages) {
    const run = runs[runs.length - 1];
    if (
      run &&
      run.authorId === message.author.id &&
      utcDay(run.last.createdAt) === utcDay(message.createdAt)
    ) {
      run.items.push(message);
      run.last = message;
      continue;
    }
    runs.push({
      authorId: message.author.id,
      mine: message.author.id === meId,
      first: message,
      last: message,
      items: [message],
    });
  }
  return runs;
}

/** Ставить ли дата-чип перед сообщением: смена дня относительно предыдущего
 *  (или начало ленты — чип первого дня ставится всегда). */
export function startsNewDay(prev: ChatMessage | undefined, cur: ChatMessage): boolean {
  return !prev || utcDay(prev.createdAt) !== utcDay(cur.createdAt);
}

/** Метка дата-чипа: «Сегодня» / «Вчера» / «5 сентября» (Intl ru-RU).
 *  `now` инжектируется для тестов. */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const day = new Date(iso);
  const startOf = (d: Date): number =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (diffDays === 0) return ui.chat.today;
  if (diffDays === 1) return ui.chat.yesterday;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(day);
}
