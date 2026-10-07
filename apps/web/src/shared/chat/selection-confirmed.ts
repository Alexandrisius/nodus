import type { ChatMessage } from '@nodus/contracts';

/** Есть ли в наборе летящие темпы (seq=0) — для гри-аута команд (#243,
 *  вердикт владельца: недоступные команды СЕРЫЕ на время отправки, без
 *  уведомлений — как в Telegram). */
export function hasPendingMessages(messages: readonly ChatMessage[]): boolean {
  return messages.some((m) => m.seq === 0);
}

/** Идентификаторы для БАТЧ-команд селекта (удаление/пересылка/звёзды):
 *  только подтверждённые сервером записи — у летящих темпов (seq=0,
 *  id=tempId) серверного id ещё нет, команда по tempId была бы 404 (#243). */
export function confirmedIdsOf(messages: readonly ChatMessage[]): string[] {
  return messages.filter((m) => m.seq > 0).map((m) => m.id);
}
