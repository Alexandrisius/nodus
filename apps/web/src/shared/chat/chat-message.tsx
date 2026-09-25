import { memo } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Message, MessageAvatar, MessageContent } from '@nodus/ui/components/message';
import { Bubble, BubbleContent } from '@nodus/ui/components/bubble';

import { openCardViaBridge } from '../lib/card-bridge.js';
import { MessageAttachments } from './attachments.js';
import { BubbleTail } from './bubble-tail.js';
import { useChatPrefs } from './chat-prefs.js';
import { useChatHostNavigation } from './chat-host.js';
import { useJumpStore } from './jump-store.js';
import { ForwardedHeader, ReplyHeader } from './message-headers.js';
import { MessageMeta } from './message-meta.js';
import { MessageReaders } from './message-readers.js';
import { MessageText } from './message-text.js';
import { MessageTombstone } from './tombstone.js';
import { PersonAvatar } from '../ui/person-avatar.js';

/** Реакции сообщения: плоские моно-чипы на токенах (моя — info). */
export function MessageReactions({ message }: { message: ChatMessage }) {
  if (message.reactions.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {message.reactions.map((reaction) => (
        <span
          key={reaction.emoji}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-label-sm tabular-nums',
            reaction.mine
              ? 'border-info/40 bg-info-soft/60 text-info'
              : 'border-border bg-accent/40 text-muted-foreground',
          )}
        >
          {reaction.emoji} {reaction.count}
        </span>
      ))}
    </span>
  );
}

/**
 * Сообщение чата по канону Битрикс24/Телеграм (вердикт владельца 14.09.2026,
 * план docs/mvp/archive/chat-messages-plan.md; имя внутрь пузыря — вердикт
 * 24.09.2026, #96): лента grouped на серии одного автора (`message-groups.ts`),
 * и серия распределяет атрибуты —
 * - имя (`showName`): только чужое и только ВНУТРИ ПЕРВОГО пузыря серии —
 *   верхней строкой облака, полужирным акцентом (реф Битрикс24: имя цветное и
 *   отличается от текста, лента читается без лишней вертикали «имя — пузырь»);
 * - аватар (`showAvatar`): один на серию, у ПОСЛЕДНЕГО сообщения, внизу
 *   (MessageAvatar-примитив self-end); у остальных сообщений серии колонка
 *   аватара резервируется проставкой — пузыри стоят на одной вертикали;
 * - хвостик (`tail`): только у ПОСЛЕДНЕГО пузыря серии, из его нижнего угла
 *   к низу аватарки (BubbleTail, SVG под пузырём);
 * - мета: нижняя строка ПОД содержимым (не в строке текста) — реакции слева,
 *   пин/«изменено»/время/галочки справа (`message-meta.tsx`, общий с постами
 *   каналов); для скринридера у сообщений без видимого имени — sr-only
 *   автор (визуальное имя только у первого в серии — AT не должен терять
 *   автора).
 * Выравнивание — НАСТРОЙКА пользователя (`chat-prefs.ts`): 'one' (дефолт) —
 * все с одной стороны; 'both' — классика: свои справа. Реакции и вложения —
 * ВНУТРИ пузыря; действия — контекстное меню по правому клику (MessageMenu,
 * без кнопок на сообщении — вердикт владельца).
 */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  mine,
  showName = false,
  showAvatar = true,
  tail = false,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Имя автора ВНУТРИ пузыря верхней строкой — только чужое и только первое в серии. */
  showName?: boolean;
  /** Аватар — один на серию, у последнего сообщения. */
  showAvatar?: boolean;
  /** Хвостик из низа аватарки — у последнего пузыря серии. */
  tail?: boolean;
}) {
  const align = useChatPrefs((s) => s.align);
  const atEnd = mine && align === 'both';
  // Хозяин чата (вердикт 25.09): мессенджер навигирует внутренне, у чатов
  // карточек сущностей контекста нет — их переход к чужой беседе идёт
  // карточкой мессенджера (слайдер поверх сущности).
  const host = useChatHostNavigation();

  // Надгробие (A5): placeholder вместо пузыря — без автора, времени и
  // действий; серия сообщений разрывается (message-groups: отдельный run).
  if (message.deletedAt) {
    return (
      <Message align={atEnd ? 'end' : 'start'}>
        <span aria-hidden className="w-8 shrink-0" />
        <MessageContent>
          <MessageTombstone mine={mine} />
        </MessageContent>
      </Message>
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

  // Чужой пузырь — вариант card: БЕЗ рамки, контур ступенью тона поверх зоны
  // (вердикт владельца 14.09.2026, рефы Битрикс24; рамка + SVG-обводка хвоста
  // давали артефакты стыка — пузыри и хвост теперь только заливками).
  const variant = mine ? 'default' : 'card';
  return (
    <Message align={atEnd ? 'end' : 'start'} className="group/msg">
      {showAvatar ? (
        <MessageAvatar>
          <PersonAvatar name={message.author.displayName} className="size-7" />
        </MessageAvatar>
      ) : (
        <span aria-hidden className="w-8 shrink-0" />
      )}
      <MessageContent>
        {/* Имя визуально — ВНУТРИ пузыря (ниже); здесь остаётся sr-only автор
            для сообщений серии без видимого имени (AT не теряет автора). */}
        {showName ? null : <span className="sr-only">{message.author.displayName}: </span>}
        <Bubble variant={variant}>
          {/* Угол со стороны хвостика — БЕЗ скругления: скруглённый угол
              оставлял собственный бордюр пузыря пересекать основание хвоста
              («пришитый отросток», вердикт владельца 14.09.2026); прямой угол
              накрыт заливкой хвоста, и штрих хвоста продолжает бордюр пузыря
              одной линией (bubble-tail.tsx). */}
          {/* Реакции и вложения — ВНУТРЬ пузыря (вердикт владельца 14.09.2026,
              реф Битрикс24): они расширяют пузырь по высоте, а НЕ висят под
              ним — иначе аватар (self-end) и хвостик отлипали от пузыря к
              строке реакций. Зазор содержимого — ЦЕЛЫЕ 3px, не rem-шаг
              (вердикт 24.09.2026, #96: облако было раздуто зазорами вокруг
              меты; дробные rem-величины при --ui-scale 1.25 округляются
              врозь — урок Switch, #96). */}
          <BubbleContent
            className={cn(
              // Вертикальные паддинги облака плотнее дефолта примитива
              // (py-2 = 10px): низ 5px — метку ВРЕМЕНИ прижать к низу облака,
              // верх 6px — над именем автора остаётся ровно воздух строки
              // (вердикт владельца 24.09.2026: «сверху и снизу облака великоватые
              // зазоры, прижать метку книзу, уменьшить зазор над именем»).
              // pt/pb — целые px: при --ui-scale 1.25 rem-полушаги дают дробные
              // зазоры с несимметричным округлением (урок Switch, #96).
              'relative flex flex-col gap-[3px] pt-[6px] pb-[5px]',
              tail && (atEnd ? 'rounded-br-none' : 'rounded-bl-none'),
            )}
          >
            {/* Имя автора — ВЕРХНЯЯ строка пузыря (вердикт владельца 24.09.2026,
                #96, реф Битрикс24): цветное и отличается от текста; только
                чужое и только у первого сообщения серии (группировка не
                менялась — message-groups.ts). Свои — без имени вовсе. */}
            {showName ? (
              <span className="text-sm leading-[19px] font-semibold text-info">
                {message.author.displayName}
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
                onClick={() => {
                  const reply = message.reply;
                  if (reply) jumpToReply(reply.id);
                }}
              />
            ) : null}
            {/* Вложения — ВЫШЕ текста (грамматика Битрикс24, план
                chat-attachments-plan): галерея/чипы сверху, затем текст. */}
            {message.attachments.length > 0 ? <MessageAttachments message={message} /> : null}
            <MessageText text={message.text} />
            {/* Нижняя строка пузыря ПОД содержимым: реакции СЛЕВА, мета
                (пин/изменено/время/галочки) — СПРАВА у самого низа облака
                (вердикт 24.09.2026: не в строке текста и не инлайном в текст).
                items-end: без реакций строка = мета (микро 10px, зазор над ней
                маленький), с реакциями строка реакций выше и толкает контент
                вверх, а метка остаётся внизу пузыря. */}
            <span className="flex items-end gap-2">
              <MessageReactions message={message} />
              <MessageMeta message={message} mine={mine} ticks={mine} className="ml-auto" />
            </span>
          </BubbleContent>
          {/* Хвостик — ПОСЛЕ тела пузыря (вердикт владельца 14.09.2026:
              «вертикальная линия-разделитель»): если рисовать до BubbleContent,
              бордюр пузыря перекрашивает заливку хвоста в стыке и читается
              шов; после — заливка хвоста накрывает угловой стык бордюра, и
              контур идёт одной линией. */}
          {tail ? <BubbleTail side={atEnd ? 'right' : 'left'} variant={variant} /> : null}
        </Bubble>
        {/* Прочитавшие — ПОД пузырём у правого края (#102: в direct строки
            нет, там только галочки меты; component сам скрывает пустое). */}
        {mine ? <MessageReaders message={message} className="mr-2 justify-end" /> : null}
      </MessageContent>
    </Message>
  );
});
