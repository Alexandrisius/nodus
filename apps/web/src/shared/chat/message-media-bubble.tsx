import type { ReactNode } from 'react';
import { Pin } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime, shortPersonName } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';
import { mediaBubbleWidth, MessageAttachments } from './attachments.js';
import { SelectSilhouetteRing } from './bubble-outline.js';
import { ForwardedHeader, ReplyHeader } from './message-headers.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './message-reactions.js';
import { MessageText } from './message-text.js';
import { ReadTicks } from './read-ticks.js';

/**
 * Медиа-сообщение Telegram (issue #187, раунды вердиктов) — АРХИТЕКТУРА
 * «ЧАСТЕЙ» (вердикт раунда 3 п.3): верхняя и нижняя части — ОТДЕЛЬНЫЕ
 * пузыри-блоки, между ними картинка. За картинкой НЕТ никакого фона —
 * совпадение краёв гарантировано конструкцией (края картинки = края блоков,
 * одна ширина), швов/дуг/полос не бывает ни в одном масштабе. Именно так
 * рисует Telegram: «нижняя и верхняя часть отдельными пузырями, между ними
 * картинка».
 *
 * - ШАПКА (есть имя/цитата/пересылка): полноценная верхняя часть пузыря
 *   (раунд 3 п.4 — не «чип», а обычная пузырная часть, rounded-top), зазор
 *   под именем до картинки меньше зазора сверху (п.9 р.2).
 * - КАРТИНКА: full-bleed; верх прямой под шапкой, скруглённый без неё;
 *   низ скруглён когда нижней части нет. Чистое изображение — чип времени
 *   в нижнем углу ПОВЕРХ картинки (п.6), реакции чипами под сообщением.
 * - НИЗ (есть текст/реакции/срочно): rounded-bottom часть с подписью;
 *   ВРЕМЯ — флоат-вправо на строке текста (п.1 р.3: всегда правый нижний
 *   угол; не помещается/есть реакции — строкой ниже; реакции считаются
 *   содержанием той строки, время справа от них). Хвостовик — у нижней части.
 * - Селект: тон-щит поверх картинки + ЕДИНЫЙ контур SelectSilhouetteRing
 *   по всей стопке (включая хвостовик).
 */
export function MediaMessage({
  message,
  mine,
  showName,
  finSide,
  onJumpToReply,
  onJumpToForwardSource,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  showName: boolean;
  /** Сторона хвостовика у нижней части (последнее сообщение серии). */
  finSide: 'left' | 'right' | null;
  onJumpToReply: (replyId: string) => void;
  onJumpToForwardSource: () => void;
  /** Пилюля реакций хозяина (ReactionPicker) — внутри стопки, снаружи клипа. */
  children?: ReactNode;
}) {
  const reply = message.reply;
  const hasHeader = showName || !!message.forwardedFrom || reply;
  const hasText = Boolean(message.text?.trim());
  // Нижняя часть — ТОЛЬКО для текста/срочности (раунд 5 п.2): реакции НЕ
  // создают её — у чистого изображения реакции чипами ПОД сообщением,
  // время остаётся чипом на картинке.
  const hasBottom = hasText || message.urgent;
  const bare = !hasHeader && !hasBottom;
  const tone = mine ? 'out' : 'in';
  const width = mediaBubbleWidth(message.attachments, { bare, hasTextColumn: !bare });
  const hasReactions = message.reactions.length > 0;
  return (
    <div
      data-slot="media-message"
      className="group/bubble relative flex w-fit max-w-full flex-col"
      style={width ? { width, maxWidth: '100%' } : undefined}
    >
      {hasHeader ? (
        <div
          data-slot="media-part"
          data-tone={tone}
          className="flex flex-col gap-[2px] rounded-t-xl px-2.5 pt-2.5 pb-[6px] leading-tight"
        >
          {showName ? (
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
      {/* КАРТИНКА: края = края сообщения (за ней фона нет — швам неоткуда
          взяться); верх прямой под шапкой, скруглённый без неё; низ
          скруглён когда нижней части нет; хвостовик imageOnly — снаружи
          клипа (внутри overflow-hidden он бы обрезался). Щит селекта —
          поверх. */}
      <span className="relative block">
        <span
          className={cn(
            'block',
            !hasHeader && 'overflow-hidden rounded-t-xl',
            !hasBottom && 'overflow-hidden rounded-b-xl',
            !hasBottom && finSide === 'left' && 'rounded-bl-none',
            !hasBottom && finSide === 'right' && 'rounded-br-none',
          )}
        >
          <MessageAttachments message={message} mine={mine} />
          <span
            aria-hidden
            data-slot="media-shield"
            className="pointer-events-none absolute inset-0"
          />
          {!hasBottom ? <MediaTimeChip message={message} mine={mine} /> : null}
        </span>
        {!hasBottom && finSide ? <BubbleFin side={finSide} tone={tone} /> : null}
      </span>
      {hasBottom ? (
        <div
          data-slot="media-part"
          data-tone={tone}
          className={cn(
            'relative rounded-b-xl px-2.5 pt-[2px] pb-[6px] leading-tight',
            finSide === 'left' && 'rounded-bl-none',
            finSide === 'right' && 'rounded-br-none',
          )}
        >
          {hasText ? (
            <span className={cn('block', hasReactions && 'pb-[2px]')}>
              <MessageText text={message.text} />
              {hasReactions ? null : <MetaFloat message={message} mine={mine} />}
            </span>
          ) : null}
          {hasReactions ? (
            <span className="flex items-end gap-2">
              <MessageReactions message={message} onFilled={mine} />
              <MessageMeta message={message} onFilled={mine} ticks={mine} className="ml-auto" />
            </span>
          ) : null}
          {finSide ? <BubbleFin side={finSide} tone={tone} /> : null}
        </div>
      ) : hasReactions ? (
        <MessageReactions message={message} onFilled={false} />
      ) : null}
      {/* Единый контур селекта по всей стопке — всегда с хвостовиком (раунд
          5 п.1: у медиа-сообщений хвостик вернулся). */}
      <SelectSilhouetteRing side={finSide} />
      {children}
    </div>
  );
}

/** Мета-время ФЛОАТ-вправо (раунд 3 п.1 + раунд 5 п.4, модель
 * Telegram/Битрикс): на той же строке, что текст — в самом правом нижнем
 * углу; когда текст доходит до неё или есть реакции — уходит строкой ниже
 * (реакции = содержание той строки, время справа от них). Прижатие к низу
 * строки — translate (НЕ margin: mt раздувал блок под line-box, нижний
 * зазор пузыря становился больше верхнего — раунд 5 п.4; transform раскладку
 * не трогает). «То слева, то справа» запрещено. */
export function MetaFloat({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <MessageMeta
      message={message}
      onFilled={mine}
      ticks={mine}
      className="float-right ml-1.5 translate-y-[3px]"
    />
  );
}

/** Блок медиа поста канала: full-bleed вложения + щит селекта (тон поверх
 * картинки) + опциональный чип времени соло-изображения (р.3 п.2). */
export function MediaArea({
  message,
  mine,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Доп. оверлеи хозяина (чип времени) — поверх картинки. */
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

/** Чип времени чистого изображения (без нижней части): нижний правый угол
 * ПОВЕРХ картинки, тёмная полупрозрачная заливка, мягкие углы, белый текст;
 * галочки — только у своих (currentColor = белый). */
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

/** Рамка выделения НАД контентом (border-2 по краю, не шире): для хостов
 * без SVG-силуэта (посты каналов) — единый с пузырями стиль рамки селекта. */
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

/** Хвостовик нижней части медиа-сообщения: маленький SVG у нижнего угла ЧАСТИ
 * (не стопки), заливка тоном части; кривая — та же геометрия плавника
 * outlinePath (20-юнитовая сетка), замкнутая по краю части. */
export function BubbleFin({ side, tone }: { side: 'left' | 'right'; tone: 'in' | 'out' }) {
  const u = 1.25; // css px на юнит при UI_SCALE 1.25
  const w = 8 * u;
  const h = 9 * u;
  const f = (n: number) => (n * u).toFixed(2);
  const d =
    side === 'left'
      ? `M0 0 L${f(5.2)} 0 Q${f(7.8)} ${f(-0.4)} ${f(6.5)} ${f(-1.5)} C${f(3.5)} ${f(-2.5)} 0 ${f(-4.5)} 0 ${f(-9)} Z`
      : `M${f(8)} 0 L${f(2.8)} 0 Q${f(0.2)} ${f(-0.4)} ${f(1.5)} ${f(-1.5)} C${f(4.5)} ${f(-2.5)} ${f(8)} ${f(-4.5)} ${f(8)} ${f(-9)} Z`;
  return (
    <svg
      aria-hidden
      data-slot="bubble-fin"
      className={cn(
        'pointer-events-none absolute bottom-0',
        side === 'left' ? 'left-0' : 'right-0',
      )}
      width={w}
      height={h}
      viewBox={`0 ${(-9 * u).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`}
    >
      <path d={d} className={tone === 'in' ? 'fill-bubble-in' : 'fill-bubble-out'} />
    </svg>
  );
}
