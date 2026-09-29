import { memo } from 'react';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Message, MessageAvatar, MessageContent } from '@nodus/ui/components/message';

import { useChatPrefs } from './chat-prefs.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './chat-message.js';
import { ReactionPicker } from './reaction-picker.js';
import { StickerPackPopover } from './sticker-pack-popover.js';

/**
 * Стикер-сообщение (#143, модель Telegram/Битрикс24): БЕЗ пузыря — крупный
 * глиф (прецеденты обхода пузыря: одиночный эмодзи #130, надгробие A5),
 * метка времени под ним; имя автора не выводится (канон Telegram), для AT —
 * sr-only как в обычных сообщениях без видимого имени. Клик по стикеру —
 * поповер пака (сетка + «Добавить пак», дистрибуция «из чата»).
 */

/** Вложение-стикер сообщения (kind='sticker') или undefined. */
export function stickerAttachmentOf(message: ChatMessage): MessageAttachment | undefined {
  return message.attachments.find((a) => a.kind === 'sticker');
}

/** Рендер одного стикера: WebM (Telegram-формат) — беззвучное зацикленное
 *  видео; WebP/PNG — img (анимированный WebP играет сам, прозрачность
 *  работает во всех браузерах — Safari не умеет alpha у WebM). */
export function StickerGlyph({
  url,
  mime,
  alt,
  className,
}: {
  url: string;
  mime: string;
  alt?: string;
  className?: string;
}) {
  if (mime === 'video/webm') {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        disablePictureInPicture
        className={className}
        aria-label={alt}
      />
    );
  }
  return <img src={url} alt={alt ?? ''} draggable={false} className={className} />;
}

/** Стикер-сообщение: глиф ~144px + мета; ховер-реакции — та же механика,
 *  что у пузырей (group/bubble-контейнер для ReactionPicker). */
export const StickerMessageView = memo(function StickerMessageView({
  message,
  attachment,
  mine,
  showAvatar = true,
  reactionsHidden = false,
}: {
  message: ChatMessage;
  attachment: MessageAttachment;
  mine: boolean;
  showAvatar?: boolean;
  reactionsHidden?: boolean;
}) {
  const align = useChatPrefs((s) => s.align);
  const atEnd = mine && align === 'both';
  const meta = attachment.sticker ?? null;
  return (
    <Message align={atEnd ? 'end' : 'start'} className="group/msg">
      {showAvatar ? (
        <MessageAvatar>
          {/* Аватар серии не дублируется глифом — но колонка резервируется,
              серии сообщений стоят на одной вертикали (message-groups). */}
          <span className="sr-only">{message.author.displayName}</span>
        </MessageAvatar>
      ) : (
        <span aria-hidden className="w-8 shrink-0" />
      )}
      <MessageContent>
        <span className="relative flex flex-col group/bubble">
          <StickerPackPopover message={message} attachment={attachment}>
            <button
              type="button"
              aria-label={meta ? `${meta.packTitle}: ${meta.emojis.join(' ')}` : undefined}
              title={meta?.packTitle}
              className={cn(
                'cursor-pointer rounded-xl p-1 transition-transform duration-150 hover:scale-105 hover:bg-accent/50',
              )}
            >
              <StickerGlyph
                url={attachment.url ?? ''}
                mime={attachment.mime}
                alt={meta ? `${meta.packTitle} ${meta.emojis.join(' ')}` : undefined}
                className="size-36 object-contain"
              />
            </button>
          </StickerPackPopover>
          {/* Нижняя строка — как у пузырей (реакции слева, мета справа),
              тон muted: стикер без поверхности (#127). */}
          <span className="flex items-end gap-2">
            <MessageReactions message={message} onFilled={false} />
            <MessageMeta message={message} onFilled={false} ticks={mine} className="ml-auto" />
          </span>
          {reactionsHidden ? null : <ReactionPicker message={message} atEnd={atEnd} />}
        </span>
      </MessageContent>
    </Message>
  );
});
