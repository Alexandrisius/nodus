import { Ban } from 'lucide-react';
import { ui } from '@nodus/contracts';

/**
 * Надгробие удалённого сообщения (A5, #87): «со следом» — когда сообщение
 * прочитал хотя бы один участник (правило #41; сервер решает, клиент рендерит).
 * Нейтральный placeholder (Discord/CometChat-канон): приглушённый курсив,
 * иконка, role="status" для скринридеров; КТО удалил — не раскрываем
 * (аудит I9 знает), но своё/чужое различаем текстом. Без автора, времени и
 * действий — серию сообщений разрывает (message-groups: отдельный run).
 */
export function MessageTombstone({ mine }: { mine: boolean }) {
  return (
    <span
      role="status"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground italic"
    >
      <Ban className="size-3.5 shrink-0" strokeWidth={1.75} />
      {mine ? ui.chat.deletedByYou : ui.chat.deletedPlaceholder}
    </span>
  );
}
