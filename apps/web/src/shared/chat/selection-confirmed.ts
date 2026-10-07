import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import type { ChatMessage } from '@nodus/contracts';

/** Идентификаторы для БАТЧ-команд селекта (удаление/пересылка/звёзды):
 *  только подтверждённые сервером записи — у летящих темпов (seq=0,
 *  id=tempId) серверного id ещё нет, команда по tempId была бы 404 (#243).
 *  Летящие в наборе — тост-подсказка (очередь доедет — команда догонит). */
export function confirmedIdsOf(messages: readonly ChatMessage[]): string[] {
  if (messages.some((m) => m.seq === 0)) {
    toast(ui.chat.selectionStillSending);
  }
  return messages.filter((m) => m.seq > 0).map((m) => m.id);
}
