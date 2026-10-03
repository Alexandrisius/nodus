import { memo } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Message, MessageAvatar, MessageContent } from '@nodus/ui/components/message';
import { Bubble, BubbleContent } from '@nodus/ui/components/bubble';

import { openCardViaBridge } from '../lib/card-bridge.js';
import { shortPersonName, withoutPatronymic } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';
import { attachmentsLayout, mediaBubbleWidth, MessageAttachments } from './attachments.js';
import { BubbleOutline } from './bubble-outline.js';
import { useChatPrefs } from './chat-prefs.js';
import { useChatHostNavigation } from './chat-host.js';
import { useJumpStore } from './jump-store.js';
import { ForwardedHeader, ReplyHeader } from './message-headers.js';
import { MessageReactions } from './message-reactions.js';
import { MessageMeta } from './message-meta.js';
import { MessageText } from './message-text.js';
import { ReactionPicker } from './reaction-picker.js';
import { stickerAttachmentOf, StickerMessageView } from './sticker-message.js';
import { TombstoneBubble } from './tombstone.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { MediaMessage, MetaFloat } from './message-media-bubble.js';

/** Реакции — в собственном файле (потребитель-стикер #143); реэкспорт для
 *  точек импорта (post-card, тесты). */
export { MessageReactions } from './message-reactions.js';

/**
 * Сообщение чата по канону Битрикс24/Телеграм (вердикт владельца 14.09.2026,
 * план docs/mvp/archive/chat-messages-plan.md; имя внутрь пузыря — вердикт
 * 24.09.2026, #96): лента grouped на серии одного автора (`message-groups.ts`),
 * и серия распределяет атрибуты —
 * - имя (`showName`): только чужое и только ВНУТРИ ПЕРВОГО пузыря серии —
 *   верхней строкой облака, полужирным акцентом (реф Битрикс24: имя цветное и
 *   отличается от текста, лента читается без лишней вертикали «имя — пузырь»);
 * - аватар: один на серию, у ПОСЛЕДНЕГО сообщения — колонку аватара держит
 *   grid серии (`message-run.tsx`, #164: аватар — sticky-элемент серии,
 *   прилипает к нижней кромке ленты при прокрутке); вне серий (посты каналов,
 *   корень треда) компонента рисует аватар сама (`avatarSlot="avatar"`);
 * - хвостик (`tail`): только у ПОСЛЕДНЕГО пузыря серии, из его нижнего угла
 *   к низу аватарки (BubbleOutline, SVG-слой на боксе пузыря);
 * - мета: нижняя строка ПОД содержимым (не в строке текста) — реакции слева,
 *   пин/«изменено»/время/галочки справа (`message-meta.tsx`, общий с постами
 *   каналов); для скринридера у сообщений без видимого имени — sr-only
 *   автор (визуальное имя только у первого в серии — AT не должен терять
 *   автора).
 * Выравнивание — НАСТРОЙКА пользователя (`chat-prefs.ts`): 'one' (дефолт) —
 * все с одной стороны; 'both' — классика: свои справа. Реакции и вложения —
 * ВНУТРИ пузыря; действия — контекстное меню по правому клику (MessageMenu,
 * без кнопок на сообщении — вердикт владельца).
 * Стикер-сообщение (#143) — отдельная ветка без пузыря (StickerMessageView).
 */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  mine,
  showName = false,
  avatarSlot = 'avatar',
  tail = false,
  reactionsHidden = false,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Имя автора ВНУТРИ пузыря верхней строкой — только чужое и только первое в серии. */
  showName?: boolean;
  /** Слот аватара: 'avatar' — рисуем свой (вне серий: посты каналов, корень
   *  треда); 'none' — колонку аватара держит grid серии (message-run.tsx,
   *  #164), распорка не нужна. */
  avatarSlot?: 'avatar' | 'none';
  /** Хвостик из низа аватарки — у последнего пузыря серии. */
  tail?: boolean;
  /** Режим выделения: реакции недоступны (модель Битрикс24, #132 р.4). */
  reactionsHidden?: boolean;
}) {
  const align = useChatPrefs((s) => s.align);
  const atEnd = mine && align === 'both';
  // Хозяин чата (вердикт 25.09): мессенджер навигирует внутренне, у чатов
  // карточек сущностей контекста нет — их переход к чужой беседе идёт
  // карточкой мессенджера (слайдер поверх сущности).
  const host = useChatHostNavigation();

  // Чужой пузырь — вариант card: БЕЗ рамки, контур ступенью тона поверх зоны
  // (вердикт владельца 14.09.2026, рефы Битрикс24; рамка + SVG-обводка хвоста
  // давали артефакты стыка — пузыри и хвост теперь только заливками).
  const variant = mine ? 'default' : 'card';

  // Надгробие (#163, вердикт владельца 30.09 «по ответам»): обычный пузырь
  // серии — аватар/имя/мета/хвостик несёт серия (message-groups не рвёт run),
  // внутри приглушённая строка «Сообщение удалено». Сервер оставляет его
  // только при живых ответах (якорь цепочки); контент обнулён в DTO,
  // действий нет — conversation-pane рендерит надгробие БЕЗ MessageMenu.
  if (message.deletedAt) {
    return (
      <TombstoneBubble
        message={message}
        mine={mine}
        showName={showName}
        avatarSlot={avatarSlot}
        tail={tail}
      />
    );
  }

  // Стикер (#143): без пузыря — крупный глиф + метка; клик — поповер пака
  // (дистрибуция «из чата»). Имя автора не выводится (канон Telegram).
  const stickerAttachment = stickerAttachmentOf(message);
  if (stickerAttachment) {
    return (
      <StickerMessageView
        message={message}
        attachment={stickerAttachment}
        mine={mine}
        avatarSlot={avatarSlot}
        reactionsHidden={reactionsHidden}
      />
    );
  }

  /** Клик по цитате — прыжок к оригиналу в ТОМ ЖЕ контексте (лента/тред:
   *  ответ не пересекает тред — threadRootId текущего сообщения). */
  function jumpToReply(replyId: string) {
    useJumpStore.getState().request(message.conversationId, replyId, message.threadRootId);
  }

  /** Клик по «Переслано от» — к оригиналу. В мессенджере (страница/карточка)
   *  навигация ВНУТРИ него: переключиться на беседу-источник/тред — слайдер
   *  не открывается (вердикт 25.09); в карточке слайдера это замена её
   *  содержимого (без вложенных слайдеров). Чат карточки сущности открывает
   *  мессенджер-карточку поверх (легитимная роль слайдера). Далее jump-запрос
   *  подбирает лента целевой беседы (переживает навигацию, jump-store). */
  function jumpToForwardSource() {
    const from = message.forwardedFrom;
    if (!from) return;
    if (from.conversationId !== message.conversationId) {
      if (host) host.openConversation(from.conversationId, from.threadRootId);
      else openCardViaBridge({ kind: 'messenger', id: from.conversationId });
    }
    useJumpStore.getState().request(from.conversationId, from.messageId, from.threadRootId);
  }

  // Медиа (single/gallery) — АРХИТЕКТУРА «ЧАСТЕЙ» (раунд 3 п.3/п.4):
  // отдельные блоки шапки/низа, между ними картинка; за картинкой фона нет —
  // швам неоткуда взяться. Вся композиция — MediaMessage.
  const layout = attachmentsLayout(message.attachments);
  const media = layout.mode === 'single' || layout.mode === 'gallery';
  const finSide = tail ? (atEnd ? 'right' : 'left') : null;
  if (media) {
    return (
      <Message align={atEnd ? 'end' : 'start'} className="group/msg">
        {avatarSlot === 'avatar' ? (
          <MessageAvatar>
            <PersonAvatar name={message.author.displayName} className="size-7" />
          </MessageAvatar>
        ) : null}
        <MessageContent>
          {showName ? null : (
            <span className="sr-only">{withoutPatronymic(message.author.displayName)}: </span>
          )}
          <MediaMessage
            message={message}
            mine={mine}
            showName={showName}
            finSide={finSide}
            onJumpToReply={jumpToReply}
            onJumpToForwardSource={jumpToForwardSource}
          >
            {reactionsHidden ? null : <ReactionPicker message={message} atEnd={atEnd} />}
          </MediaMessage>
        </MessageContent>
      </Message>
    );
  }

  const contentWidth = mediaBubbleWidth(message.attachments, {
    hasTextColumn: true,
  });
  return (
    <Message align={atEnd ? 'end' : 'start'} className="group/msg">
      {avatarSlot === 'avatar' ? (
        <MessageAvatar>
          <PersonAvatar name={message.author.displayName} className="size-7" />
        </MessageAvatar>
      ) : null}
      <MessageContent>
        {/* Имя визуально — ВНУТРИ пузыря (ниже); здесь остаётся sr-only автор
            для сообщений серии без видимого имени (AT не теряет автора). */}
        {showName ? null : (
          <span className="sr-only">{withoutPatronymic(message.author.displayName)}: </span>
        )}
        <Bubble variant={variant}>
          {/* Контурный слой (#155 р.10-11) — ПОД контентом: единая заливка
              силуэта (CSS-фон пузыря прозрачен); рамка селекта (толстая,
              единая с хвостиком) — второй svg слоя НАД контентом (р.2 п.1). */}
          <BubbleOutline side={finSide} variant={variant} />
          {/* Угол со стороны хвостика — БЕЗ скругления: прямой угол накрыт
              заливкой хвоста, штрих хвоста продолжает бордюр пузыря одной
              линией (bubble-outline.tsx, вердикт 14.09.2026). */}
          {/* Реакции и вложения — ВНУТРЬ пузыря (вердикт 14.09.2026): они
              расширяют пузырь по высоте. Зазор строк — ЦЕЛЫЕ 2px (вердикт
              #181: дробные rem при --ui-scale 1.25 округляются врозь). */}
          <BubbleContent
            className={cn(
              // Поля 10px сверху/сбоку (низ несут блоки: время прижато к
              // нижнему углу). leading-tight — ШТРИХ контейнера (р.2 п.7):
              // фактический шаг строк задаёт strut блока-родителя.
              'relative flex flex-col gap-[2px] px-2.5 pt-2.5 leading-tight',
              tail && (atEnd ? 'rounded-br-none' : 'rounded-bl-none'),
            )}
            style={contentWidth ? { width: contentWidth, maxWidth: '100%' } : undefined}
          >
            {/* Имя автора — ВЕРХНЯЯ строка пузыря (вердикт 24.09.2026, #96):
                только чужое и только у первого сообщения серии; цвет
                ПЕРСОНАЛЬНЫЙ (#180). -mt-[3px] — оптическая компенсация (#181). */}
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
            {/* Атрибуция пересылки — следующая строка пузыря (канон
                Telegram lng_forwarded). */}
            {message.forwardedFrom ? (
              <ForwardedHeader from={message.forwardedFrom} onClick={jumpToForwardSource} />
            ) : null}
            {/* Цитата ответа (A2): замороженный снапшот — клик ведёт к
                оригиналу (актуальная версия + «изменено» там же). */}
            {message.reply ? (
              <ReplyHeader
                reply={message.reply}
                onFilled={mine}
                onClick={() => {
                  const reply = message.reply;
                  if (reply) jumpToReply(reply.id);
                }}
              />
            ) : null}
            {/* Вложения-карточки — ВЫШЕ текста (грамматика Битрикс24):
                карточный список сверху, затем текст. */}
            {message.attachments.length > 0 ? (
              <MessageAttachments message={message} mine={mine} />
            ) : null}
            {/* Текст + ВРЕМЯ одной строкой (р.3 п.1, модель Telegram/Битрикс):
                время — ФЛОАТ в самом правом нижнем углу строки; текст длинный
                или есть реакции — время строкой ниже справа, реакции =
                содержание той строки. Короткое сообщение не раздувается. */}
            <span
              className={cn(
                'block',
                showName || message.reply || message.forwardedFrom || message.attachments.length > 0
                  ? ''
                  : '-mt-[3px]',
                message.reactions.length > 0 ? 'pb-[2px]' : 'pb-[6px]',
              )}
            >
              <MessageText text={message.text} />
              {message.reactions.length > 0 ? null : <MetaFloat message={message} mine={mine} />}
            </span>
            {message.reactions.length > 0 ? (
              <span className="flex items-end gap-2 pb-[6px]">
                <MessageReactions message={message} onFilled={mine} />
                <MessageMeta message={message} onFilled={mine} ticks={mine} className="ml-auto" />
              </span>
            ) : null}
          </BubbleContent>
          {/* Ховер-попап реакций (#124): кнопка у нижнего угла пузыря
              (Bubble — relative), видна по hover/focus/открытом попапе. */}
          {/* В режиме выделения реакции недоступны (модель Битрикс24, #132 р.4). */}
          {reactionsHidden ? null : <ReactionPicker message={message} atEnd={atEnd} />}
        </Bubble>
      </MessageContent>
    </Message>
  );
});
