import type { ReactNode } from 'react';
import { Pin } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime, shortPersonName } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';
import { MessageAttachments } from './attachments.js';
import { ForwardedHeader, ReplyHeader } from './message-headers.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './message-reactions.js';
import { MessageText } from './message-text.js';
import { ReadTicks } from './read-ticks.js';

/**
 * Медиа-сообщение Telegram (#187 + раунд вердикта владельца): два вида.
 *
 * **Bare (чистое изображение/галерея без текста/цитаты, п.6):** пузыря НЕТ —
 * картинка со скруглёнными углами со всех сторон; чип времени и галочки —
 * в нижнем правом углу ПОВЕРХ картинки на тёмной полупрозрачной заливке
 * белым (модель Telegram/Битрикс24); реакции — чипами ПОД картинкой (п.9:
 * лента якорится низом — реакции растят сообщение вверх); имя чужого —
 * цветной строкой над картинкой. Селект — щит-тонировка поверх картинки
 * + рамка-оверлей (п.3/п.5).
 *
 * **Пузырь (есть подпись/цитата/пересылка/срочно):** BubbleContent без
 * полей, шапка/подпись/низ — блоками с полями; шапка отделена от картинки
 * зазором 6px (п.4); низ с временем прижат к нижнему углу — pb-5px (п.7).
 * Изображение full-bleed = край пузыря: SVG-слой без кольца (п.1 — полоска
 * вокруг картинки запрещена), рамка селекта — ОВЕРЛЕЕМ над контентом (п.5).
 * ЕДИНАЯ точка для всех хостов пузыря (лента беседы, тред, обсуждение
 * задачи, карточка мессенджера из уведомлений): хосты рендерят
 * ChatMessageItem, медиа-вид не дублируют.
 */
export function MediaBubbleContent({
  message,
  mine,
  showName,
  onJumpToReply,
  onJumpToForwardSource,
}: {
  message: ChatMessage;
  /** Чья поверхность (пузырь свой/чужой) — тон меты и карточек вложений. */
  mine: boolean;
  /** Имя автора верхней строкой — чужое и только первое в серии. */
  showName: boolean;
  onJumpToReply: (replyId: string) => void;
  onJumpToForwardSource: () => void;
}) {
  const reply = message.reply;
  return (
    <>
      {showName || message.forwardedFrom || reply ? (
        // pb-[6px] — зазор между шапкой (цитатой) и картинкой (вердикт п.4:
        // в Telegram цитата не прилипает к изображению).
        <div className="flex flex-col gap-[2px] px-2.5 pt-2.5 pb-[6px]">
          {showName ? (
            // -mt-[3px] — оптическая компенсация воздуха строки имени (#181):
            // визуальный верх = полям 10px, как у картинок.
            <span
              className={cn(
                '-mt-[3px] text-sm leading-[19px] font-semibold',
                personTone(message.author.id),
              )}
            >
              {shortPersonName(message.author.displayName)}
            </span>
          ) : null}
          {message.forwardedFrom ? (
            <ForwardedHeader from={message.forwardedFrom} onClick={onJumpToForwardSource} />
          ) : null}
          {reply ? (
            <ReplyHeader reply={reply} onFilled={mine} onClick={() => onJumpToReply(reply.id)} />
          ) : null}
        </div>
      ) : null}
      {/* Медиа — full-bleed + щит селекта: тонировка ПОВЕРХ изображения
          (п.3: заливка пузыря под картинкой не видна). */}
      <MediaArea message={message} mine={mine} />
      {message.text ? (
        <div className="px-2.5 pt-[2px]">
          <MessageText text={message.text} />
        </div>
      ) : null}
      {/* Нижняя часть: время прижато к нижнему правому углу пузыря (п.7) —
          pb-5px вместо 10: «висит в воздухе над границей» запрещено. */}
      <div className="flex items-end gap-2 px-2.5 pt-[2px] pb-[5px]">
        <MessageReactions message={message} onFilled={mine} />
        <MessageMeta message={message} onFilled={mine} ticks={mine} className="ml-auto" />
      </div>
    </>
  );
}

/** Блок медиа: full-bleed вложения + щит селекта (тон поверх картинки). */
export function MediaArea({
  message,
  mine,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Доп. оверлеи хозяина (чип времени bare-режима) — поверх картинки. */
  children?: ReactNode;
}) {
  return (
    <span className="relative block">
      <MessageAttachments message={message} mine={mine} />
      <span aria-hidden data-slot="media-shield" className="pointer-events-none absolute inset-0" />
      {children}
    </span>
  );
}

/** Рамка выделения НАД контентом (п.5): SVG-кольцо слоя под картинкой
 *  невидимо — рамка рисуется оверлеем по краю пузыря/картинки, не шире
 *  (inset-0, border-2 внутри). Прозрачна вне выделения. */
export function SelectRing() {
  return (
    <span
      aria-hidden
      data-slot="select-ring"
      className="pointer-events-none absolute inset-0 rounded-xl border-2 opacity-0 transition-opacity"
      style={{ borderColor: 'var(--selection-ring)' }}
    />
  );
}

/** Чип времени bare-медиа (п.6): нижний правый угол ПОВЕРХ картинки,
 *  тёмная полупрозрачная заливка, мягкие углы, белый текст; галочки —
 *  только у своих (currentColor = белый). */
export function MediaTimeChip({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-badge font-medium text-white">
      {message.pinned ? (
        <Pin role="img" aria-label={ui.chat.menu.pin} className="size-3" strokeWidth={1.75} />
      ) : null}
      {message.editedAt ? <span>{ui.chat.edited}</span> : null}
      <time className="font-mono tabular-nums" dateTime={message.createdAt}>
        {formatTime(message.createdAt)}
      </time>
      {mine ? <ReadTicks read={message.readBy.length > 0} /> : null}
    </span>
  );
}
