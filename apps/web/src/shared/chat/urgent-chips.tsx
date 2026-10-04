import { useState } from 'react';
import { Zap } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useAckUrgentByMessage, useSelfUrgentAck } from '../notifications-acks.js';

/**
 * Чипы важного сообщения на пузыре (#177, реф владельца — скрин Яндекса):
 *
 * - «Важное» с молнией — виден ВСЕМ участникам и во всех хостах рендера
 *   (пузырь чата, медиа, пост канала, витрина «Избранного»); оттенок —
 *   warning-токены (кандидат цвета — образцы на приёмке). Сидит на нижней
 *   кромке пузыря «сквозь бордер» (приём «призрак+булавка» #187 — абсолют
 *   от края поверхности; место под чип резервирует BubbleContent pb).
 * - «Ознакомлен» — ТОЛЬКО получателю requireAck-сообщения: чип-кнопка до
 *   нажатия, «Ознакомлен ✓» после (оптимистично, I4; восстановление после
 *   F5 — GET self-ack). Автору вместо него мета «Ознакомились N из M».
 *
 * НЕ рендерится: надгробиям (#163 — контент обнулён), витрине с
 * noReceipts (там только метка «Важное»), важным без requireAck у
 * получателя (одно уведомление, действий нет).
 */
export function UrgentMarkChip({ className }: { className?: string }) {
  return (
    <span
      data-slot="urgent-chip"
      className={cn(
        'flex h-5 items-center gap-1 rounded-full border border-warning bg-warning-soft px-1.5 text-badge font-medium text-warning',
        className,
      )}
    >
      <Zap className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
      {ui.notifications.urgentToggle}
    </span>
  );
}

export function UrgentAckChip({ messageId }: { messageId: string }) {
  const selfAck = useSelfUrgentAck(messageId);
  const ack = useAckUrgentByMessage();
  const [pressed, setPressed] = useState(false);
  // pressed — optimistic-флаг на время мутации (self-ack придёт с сервера).
  const acked = pressed || Boolean(selfAck?.ackedAt);
  if (acked) {
    return (
      <span
        data-slot="urgent-ack-done"
        className="flex h-5 items-center gap-1 rounded-full border border-success bg-success-soft px-1.5 text-badge font-medium text-success"
      >
        {ui.notifications.ackChipDone}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-slot="urgent-ack-button"
      className="flex h-5 cursor-pointer items-center gap-1 rounded-full border border-warning bg-warning-soft px-1.5 text-badge font-medium text-warning transition-colors hover:bg-warning hover:text-warning-soft"
      onClick={() => {
        setPressed(true);
        ack.mutate(messageId, { onSettled: () => setPressed(false) });
      }}
    >
      <Zap className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
      {ui.notifications.ackChipButton}
    </button>
  );
}

/**
 * Ряд чипов на нижней кромке пузыря (справа): [Ознакомлен][Важное].
 * Вызывается хостами пузыря (chat-message, media-низ, post-card) как
 * ребёнок ОТНОСИТЕЛЬНОЙ поверхности.
 */
export function UrgentChips({
  message,
  mine,
  noReceipts = false,
  inline = false,
  className,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Витрина «Избранного» (#215): ack-кнопки нет (метка важного остаётся). */
  noReceipts?: boolean;
  /** Инлайн (в потоке, справа) — хосты с overflow-hidden (пост-карточка),
   *  где стрэддл через кромку обрезался бы. */
  inline?: boolean;
  className?: string;
}) {
  if (!message.urgent || message.deletedAt) return null;
  const showAck = message.requireAck && !mine && !noReceipts;
  return (
    <span
      data-slot="urgent-chips"
      className={cn(
        'flex items-center gap-1.5',
        inline ? 'justify-end' : 'absolute right-2.5 -bottom-2.5 z-10',
        className,
      )}
    >
      {showAck ? <UrgentAckChip messageId={message.id} /> : null}
      <UrgentMarkChip />
    </span>
  );
}
