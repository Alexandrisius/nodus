import { memo } from 'react';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import { Message, MessageAvatar, MessageContent } from '@nodus/ui/components/message';

import { PersonAvatar } from '../ui/person-avatar.js';
import { useChatPrefs } from './chat-prefs.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './chat-message.js';
import { ReactionPicker } from './reaction-picker.js';
import { StickerWindowTrigger } from './sticker-pack-window.js';

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
  avatarSlot = 'avatar',
  reactionsHidden = false,
}: {
  message: ChatMessage;
  attachment: MessageAttachment;
  mine: boolean;
  /** Слот аватара: 'avatar' — свой (вне серий); 'none' — колонку держит
   *  grid серии (message-run.tsx, #164). */
  avatarSlot?: 'avatar' | 'none';
  reactionsHidden?: boolean;
}) {
  const align = useChatPrefs((s) => s.align);
  const atEnd = mine && align === 'both';
  const meta = attachment.sticker ?? null;
  return (
    <Message align={atEnd ? 'end' : 'start'} className="group/msg">
      {/* Аватар автора — ВИДИМЫЙ (вердикт владельца 30.09: «скидываются
          анонимно»): стикер = обычное сообщение, авторство видно всегда. */}
      {avatarSlot === 'avatar' ? (
        <MessageAvatar>
          <PersonAvatar name={message.author.displayName} className="size-7" />
        </MessageAvatar>
      ) : null}
      <MessageContent>
        {avatarSlot === 'avatar' ? null : (
          <span className="sr-only">{message.author.displayName}: </span>
        )}
        {/* w-fit: колонка по ширине глифа (не на всю строку ленты) — иначе
            мета/реакции убегают к правому краю экрана (ревизия 30.09).
            data-slot обязателен: MessageContent прижимает вправо (align=end,
            «По обе стороны») только детей с data-slot — без него стикер
            оставался слева при аватаре справа (баг-вердикт 30.09, #164). */}
        <span data-slot="sticker-message" className="relative flex w-fit flex-col group/bubble">
          <StickerWindowTrigger message={message} attachment={attachment}>
            <StickerGlyph
              url={attachment.url ?? ''}
              mime={attachment.mime}
              alt={meta ? `${meta.packTitle} ${meta.emojis.join(' ')}` : undefined}
              className="size-24 object-contain"
            />
          </StickerWindowTrigger>
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
