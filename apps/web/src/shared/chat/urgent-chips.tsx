import { useState } from 'react';
import { Zap } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useAckUrgentByMessage, useSelfUrgentAck, useUrgentAcks } from '../notifications-acks.js';

/**
 * Чипы важного сообщения на пузыре (#177, ревизия приёмки 05.10):
 *
 * - «Важное» — КОМПАКТНАЯ иконка-молния в чипе на нижней кромке (без текста:
 *   текст занимал место и наезжал на соседний пузырь; слово «Важное» несёт
 *   тултип). Видна всем участникам и во всех хостах рендера (пузырь чата,
 *   медиа, пост канала, витрина «Избранного»); тон warning (кандидат цвета).
 * - Тултип автора requireAck-сообщения — прогресс «Ознакомились N из M»
 *   (live по WS): мета-строка из пузыря УБРАНА (занимала место, ревизия
 *   приёмки; данные — в тултипе чипа).
 * - «Ознакомлен» — ТОЛЬКО получателю requireAck-сообщения: чип-кнопка до
 *   нажатия, «Ознакомлен ✓» после (оптимистично, I4; восстановление после
 *   F5 — GET self-ack). Автору вместо него прогресс в тултипе.
 *
 * НЕ рендерится: надгробиям (#163), витрине с noReceipts (там метка без
 * ack-кнопки), важным без requireAck у получателя.
 */
export function UrgentMarkChip({
  mine = false,
  requireAck = false,
  noReceipts = false,
  messageId,
}: {
  mine?: boolean;
  requireAck?: boolean;
  noReceipts?: boolean;
  messageId?: string;
}) {
  // Прогресс ознакомления — только автор своего requireAck-сообщения
  // (сервер отдаёт 404 не-автору, #202; null — запрос не шлётся).
  const status = useUrgentAcks(mine && requireAck && !noReceipts ? (messageId ?? null) : null);
  const title =
    mine && requireAck && status && status.expectedCount > 0
      ? `${ui.notifications.urgentToggle} · ${ui.notifications.urgentAcksMeta} ${status.ackedCount}/${status.expectedCount}`
      : ui.notifications.urgentToggle;
  return (
    <span
      data-slot="urgent-chip"
      title={title}
      aria-label={title}
      className="flex size-4 items-center justify-center rounded-full border border-warning bg-warning-soft text-warning"
    >
      <Zap className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />
    </span>
  );
}

export function UrgentAckChip({ messageId }: { messageId: string }) {
  const { data: selfAck, isError } = useSelfUrgentAck(messageId);
  const ack = useAckUrgentByMessage();
  const [pressed, setPressed] = useState(false);
  // pressed — optimistic-флаг на время мутации (self-ack придёт с сервера).
  const acked = pressed || Boolean(selfAck?.ackedAt);
  // 404 self-ack = я не адресат requireAck-строки (поздне-добавленный участник,
  // валидатор #177): кнопки, на которую ответ 404, не предлагаем.
  if (isError) return null;
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
      title={`${ui.notifications.ackChipButton} · ${ui.notifications.urgentRequireAckHint}`}
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
 * ребёнок ОТНОСИТЕЛЬНОЙ поверхности. inline — для карточек постов
 * (overflow-hidden: стрэддл через кромку обрезался бы).
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
        inline ? 'justify-end' : 'absolute right-2.5 -bottom-2 z-10',
        className,
      )}
    >
      {showAck ? <UrgentAckChip messageId={message.id} /> : null}
      <UrgentMarkChip
        mine={mine}
        requireAck={message.requireAck}
        noReceipts={noReceipts}
        messageId={message.id}
      />
    </span>
  );
}
