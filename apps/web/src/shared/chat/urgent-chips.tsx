import { Zap } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Чип «Важное» на пузыре (#177, ревизия модели 05.10): иконка-молния +
 * слово «Важное» (реф Яндекса), warning-токены, виден всем участникам и во
 * всех хостах рендера (пузырь чата, медиа, пост канала, витрина
 * «Избранного»). Сидит на нижней кромке пузыря «сквозь бордер» (приём
 * «призрак+булавка» #187); хосты-пузыри дают важному mb-2 (чип не наезжает
 * на следующий пузырь) и min-width контента (одно-символьное сообщение не
 * даёт чипу вылезти влево за пузырь). ack-механики нет — прочтения видит
 * автор штатными галочками «просмотрено».
 *
 * НЕ рендерится: надгробиям (#163 — контент обнулён).
 */
/** Чип «Важное» отдельно (bare-медиа без нижней части: свой якорь). */
export function UrgentChip() {
  return (
    <span
      data-slot="urgent-chip"
      title={ui.notifications.urgentToggle}
      aria-label={ui.notifications.urgentToggle}
      className="flex h-5 items-center gap-1 rounded-full border border-warning bg-warning-soft px-1.5 text-badge font-medium text-warning"
    >
      {/* Оптическая центровка: глиф Zap выше геометрического центра
          (широкая верхушка) — полпикселя вниз, как у молнии композера. */}
      <Zap className="size-3 translate-y-[0.5px]" fill="currentColor" strokeWidth={0} aria-hidden />
      {ui.notifications.urgentToggle}
    </span>
  );
}

export function UrgentChips({
  message,
  inline = false,
  className,
}: {
  message: ChatMessage;
  /** Инлайн (в потоке, справа) — хосты с overflow-hidden (пост-карточка),
   *  где стрэддл через кромку обрезался бы. */
  inline?: boolean;
  className?: string;
}) {
  if (!message.urgent || message.deletedAt) return null;
  return (
    <span
      data-slot="urgent-chips"
      className={cn(
        'flex items-center gap-1.5',
        inline ? 'justify-end' : 'absolute right-2.5 -bottom-2 z-10',
        className,
      )}
    >
      <UrgentChip />
    </span>
  );
}
