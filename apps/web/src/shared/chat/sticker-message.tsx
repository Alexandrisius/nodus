import { memo, type ReactNode } from 'react';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import { Message, MessageAvatar, MessageContent } from '@nodus/ui/components/message';

import { PersonAvatar } from '../ui/person-avatar.js';
import { useChatPrefs } from './chat-prefs.js';
import { MessageMeta } from './message-meta.js';
import { MessageReactions } from './chat-message.js';
import { useJumpStore } from './jump-store.js';
import { ReplyHeader } from './message-headers.js';
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

/** Кегль стикера в ленте — единый для чатов и постов канала: ПОТОЛОК
 *  208 CSS px (≈260 экранных при ui-scale 1.25) — паритет Telegram Desktop
 *  (maxStickerSize 256px, research Exa; вердикт владельца 01.10 #175).
 *  Мягкие углы (#288, вердикт владельца 14.10): скругление CSS-клипом,
 *  файлы не обрабатываются. Именно MAX, а не фиксированный квадрат:
 *  бокc обнимает картинку (сохраняя пропорции), иначе у неквадратных
 *  стикеров радиус резал углы ПУСТЫХ полей object-contain, а не рисунка
 *  (репро владельца 14.10: «прямоугольный не скруглился»). */
export const stickerFeedClass = 'max-h-52 max-w-52 rounded-2xl object-contain';

/** Рендер одного стикера — в собственном модуле `sticker-glyph.ts` (#288:
 *  глиф нужен цитате ответа в message-headers без цикла импортов). */
import { StickerGlyph } from './sticker-glyph.js';
export { StickerGlyph } from './sticker-glyph.js';

/** Стикер-сообщение: глиф 208px + мета; ховер-реакции — та же механика,
 *  что у пузырей (group/bubble-контейнер для ReactionPicker). */
export const StickerMessageView = memo(function StickerMessageView({
  message,
  attachment,
  mine,
  avatarSlot = 'avatar',
  reactionsHidden = false,
  reactionsRow,
  receiptsHidden = false,
  children,
}: {
  message: ChatMessage;
  attachment: MessageAttachment;
  mine: boolean;
  /** Слот аватара: 'avatar' — свой (вне серий); 'none' — колонку держит
   *  grid серии (message-run.tsx, #164). */
  avatarSlot?: 'avatar' | 'none';
  reactionsHidden?: boolean;
  /** Замена ряда реакций (карточки избранного: личные метки — #215). */
  reactionsRow?: ReactNode;
  /** Витрина «Избранного» (#215): мета «просмотрено» выключена. */
  receiptsHidden?: boolean;
  /** Пилюля реакций хозяина (ReactionPicker / пилюля личных меток). */
  children?: ReactNode;
}) {
  const align = useChatPrefs((s) => s.align);
  const atEnd = mine && align === 'both';
  const meta = attachment.sticker ?? null;
  // Ширина глифа в ленте (dp): потолок 208 по большей стороне (stickerFeedClass
  // max-h/max-w-52), вторая — по пропорции вложения. null — габариты неизвестны
  // (старые снапшоты): цитата без капа, как до #297.
  const glyphWidthDp =
    attachment.width && attachment.height
      ? Math.min(208, Math.round((208 * attachment.width) / attachment.height))
      : null;
  const quoteCap = glyphWidthDp !== null ? `${glyphWidthDp / 16}rem` : null;
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
        {/* Имя стикер НЕ показывает никогда (канон Telegram) — sr-only автор
            обязателен ВСЕГДА, включая слот с видимым аватаром (валидатор
            #164: иначе стикер вне серии терял атрибуцию, которую пузырь
            там же имеет). */}
        <span className="sr-only">{message.author.displayName}: </span>
        {/* w-fit: колонка по ширине глифа (не на всю строку ленты) — иначе
            мета/реакции убегают к правому краю экрана (ревизия 30.09).
            data-slot обязателен: MessageContent прижимает вправо (align=end,
            «По обе стороны») только детей с data-slot — без него стикер
            оставался слева при аватаре справа (баг-вердикт 30.09, #164). */}
        <span data-slot="sticker-message" className="relative flex w-fit flex-col group/bubble">
          {/* Тело «цитата+глиф» (#288) — виртуальный пузырь стикера: ЕДИНАЯ
              плита выделения (плиту с глифа снял — plate={false} у триггера,
              иначе двойной паддинг; у постов канала осталась), мета-строка —
              снаружи, как у пузырей. В базе плита прозрачна с прозрачным
              бордером (layout стабилен), data-selected красит её целиком
              (globals.css) — рамка не «только вокруг стикера» (замечание
              владельца 14.10). */}
          <span
            data-slot="sticker-body"
            className="flex w-fit flex-col rounded-2xl border border-transparent p-2"
          >
            {/* Цитата ответа (#288): стикер-ответ раньше молча терял видимую
              связь (replyToId хранился, цитата не рисовалась). КАНОН Telegram
              (вердикты владельца 14.10): фиксированное место — панель w-40
              ПРИЖАТА ВПРАВО и стоит НАД глифом В ПОТОКЕ (наложение
              «вырезало» кусок стикера — запрет владельца), длина текста не
              влияет, длинное обрезается; клик — прыжок с подсветкой. Фон —
              штатная полупрозрачная цитата: плотный фон на тонированной
              плите выделения давал чёрную кляксу (замечание владельца). */}
            {message.reply ? (
              /* Цитата НЕ расширяет строку стикера (#297, модель Telegram:
                 верхний блок не учитывается в ширине): её максимум — ширина
                 ГЛИФА, детерминированно считаемая из пропорций вложения
                 (потолок 13rem = 208dp, как stickerFeedClass); у узких
                 стикеров цитата обрезается до ширины стикера, иначе плита
                 выделения и якорь реакций следовали за цитатой w-40 и
                 реакции вставали далеко от глифа (репорт владельца 15.10).
                 Широкие глифы (>=160dp) — без изменений: w-40 прижата
                 вправо, канон #288. rem — масштабируется ui-scale. */
              <span
                className="mb-1 flex w-40 flex-col self-end"
                style={quoteCap ? { maxWidth: quoteCap } : undefined}
              >
                <ReplyHeader
                  reply={message.reply}
                  onFilled={mine}
                  onClick={() => {
                    const reply = message.reply;
                    if (reply)
                      useJumpStore
                        .getState()
                        .request(message.conversationId, reply.id, message.threadRootId);
                  }}
                />
              </span>
            ) : null}
            <StickerWindowTrigger message={message} attachment={attachment} plate={false}>
              <StickerGlyph
                url={attachment.url ?? ''}
                mime={attachment.mime}
                alt={meta ? `${meta.packTitle} ${meta.emojis.join(' ')}` : undefined}
                className={stickerFeedClass}
              />
            </StickerWindowTrigger>
          </span>
          {/* Нижняя строка — как у пузырей (реакции слева, мета справа),
              тон muted: стикер без поверхности (#127). Слот витрины
              «Избранного» — личные метки вместо публичных реакций (#215). */}
          <span className="flex items-end gap-2">
            {reactionsRow ?? <MessageReactions message={message} onFilled={false} />}
            <MessageMeta
              message={message}
              onFilled={false}
              ticks={mine}
              noReceipts={receiptsHidden}
              className="ml-auto"
            />
          </span>
          {reactionsHidden
            ? null
            : (children ?? <ReactionPicker message={message} atEnd={atEnd} />)}
        </span>
      </MessageContent>
    </Message>
  );
});
