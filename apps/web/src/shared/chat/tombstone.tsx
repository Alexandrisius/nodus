import { Ban } from 'lucide-react';
import { ui } from '@nodus/contracts';

/**
 * Надгробие удалённого сообщения (#163, вердикт владельца 30.09 «по ответам»):
 * строка ВНУТРИ пузыря серии — пузырь с аватаром, именем и метой рендерит
 * chat-message как у обычного сообщения (серия своего автора не рвётся,
 * message-groups). Раньше (A5, #87) был отдельный чип без автора — правило
 * следа «по прочтениям» отменено: надгробие живёт только как якорь цепочки
 * ответов. Приглушённый курсив + иконка, role="status" для скринридеров;
 * КТО удалил — не раскрываем (аудит I9 знает), но своё/чужое различаем текстом.
 */
export function MessageTombstone({ mine }: { mine: boolean }) {
  return (
    <span
      role="status"
      // data-slot обязателен (#132): правило примитива
      // group-data-[align=end]/message:*:data-slot:self-end прижимает к
      // правому краю в two-sided только детей С data-slot — без него надгробие
      // всегда сидело слева (пузыри прижаты, у них data-slot есть).
      data-slot="message-tombstone"
      className="inline-flex w-fit items-center gap-1.5 text-sm italic text-muted-foreground"
    >
      <Ban className="size-3.5 shrink-0" strokeWidth={1.75} />
      {mine ? ui.chat.deletedByYou : ui.chat.deletedPlaceholder}
    </span>
  );
}
