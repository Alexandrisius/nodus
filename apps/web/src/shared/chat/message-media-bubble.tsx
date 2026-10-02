import type { ChatMessage } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { shortPersonName } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';
import { MessageAttachments } from './attachments.js';
import { ForwardedHeader, ReplyHeader } from './message-headers.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './message-reactions.js';
import { MessageText } from './message-text.js';

/**
 * Контент медиа-пузыря в стиле Telegram (#187): изображение — ЧАСТЬ пузыря
 * (ширина изображения = ширина пузыря, боковых полей у медиа нет — блок
 * full-bleed, BubbleContent без полей, углы картинки режет контейнер).
 * Структура по спеке:
 * - шапка (шаг есть): имя автора (#180 персональный цвет) / «Переслано от» /
 *   цитата ответа — блок С ПОЛЯМИ над изображением, присоединён к нему;
 * - изображение/галерея — full-bleed на всю ширину пузыря;
 * - подпись (есть текст) — блок с полями ПОД изображением (переносится по
 *   ширине фото, механика Telegram captionw);
 * - нижняя часть: реакции слева, мета (пин/изменено/время/галочки) справа —
 *   блок с полями, хвостик серии рисует BubbleOutline.
 * Свои сообщения — без шапки (канон #96/#180), у изображения скруглённые
 * верхние углы (клип контейнера). ЕДИНАЯ точка для всех хостов пузыря
 * (лента беседы, тред, обсуждение задачи, карточка мессенджера из
 * уведомлений): хосты рендерят ChatMessageItem, медиа-вид не дублируют.
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
        <div className="flex flex-col gap-[2px] px-2.5 pt-2.5">
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
      {/* Медиа — full-bleed: боковых полей нет, ширина = ширина пузыря. */}
      <MessageAttachments message={message} mine={mine} />
      {message.text ? (
        <div className="px-2.5 pt-[2px]">
          <MessageText text={message.text} />
        </div>
      ) : null}
      {/* Нижняя часть пузыря: реакции слева, мета справа (канон #96/#181). */}
      <div className="flex items-end gap-2 px-2.5 pt-[2px] pb-2.5">
        <MessageReactions message={message} onFilled={mine} />
        <MessageMeta message={message} onFilled={mine} ticks={mine} className="ml-auto" />
      </div>
    </>
  );
}
