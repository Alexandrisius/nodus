import { FileText } from 'lucide-react';
import { memo } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from '@nodus/ui/components/message';
import { Bubble, BubbleContent } from '@nodus/ui/components/bubble';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@nodus/ui/components/attachment';

import { formatTime } from '../lib/format.js';
import { BubbleTail } from './bubble-tail.js';
import { useChatPrefs } from './chat-prefs.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { ReadTicks } from './read-ticks.js';

/** Реакции сообщения: плоские моно-чипы на токенах (моя — info). */
export function MessageReactions({ message }: { message: ChatMessage }) {
  if (message.reactions.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {message.reactions.map((reaction) => (
        <span
          key={reaction.emoji}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums',
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

/** Вложения сообщения: Attachment-примитивы (файл + размер не дублируем). */
export function MessageAttachments({ message }: { message: ChatMessage }) {
  if (message.attachments.length === 0) return null;
  return (
    <AttachmentGroup className="flex-wrap">
      {message.attachments.map((file) => (
        <Attachment key={file.id}>
          <AttachmentMedia>
            <FileText />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{file.name}</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

/**
 * Сообщение чата по канону Битрикс24/Телеграм (вердикт владельца 14.09.2026,
 * план docs/mvp/chat-messages-plan.md): лента grouped на серии одного автора
 * (`message-groups.ts`), и серия распределяет атрибуты —
 * - имя (`showName`): только чужое и только над ПЕРВЫМ пузырём серии;
 * - аватар (`showAvatar`): один на серию, у ПОСЛЕДНЕГО сообщения, внизу
 *   (MessageAvatar-примитив self-end); у остальных сообщений серии колонка
 *   аватара резервируется проставкой — пузыри стоят на одной вертикали;
 * - хвостик (`tail`): только у ПОСЛЕДНЕГО пузыря серии, из его нижнего угла
 *   к низу аватарки (BubbleTail, SVG под пузырём);
 * - время: ВНУТРЬ пузыря, правый нижний угол (моно 10px), рядом метка
 *   «изменено»; для скринридера у сообщений без видимого имени — sr-only
 *   автор (визуальное имя только у первого в серии — AT не должен терять
 *   автора).
 * Выравнивание — НАСТРОЙКА пользователя (`chat-prefs.ts`): 'one' (дефолт) —
 * все с одной стороны; 'both' — классика: свои справа. Реакции и вложения —
 * под пузырём; действия — контекстное меню по правому клику (MessageMenu,
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
  /** Имя автора над пузырём — только чужое и только первое в серии. */
  showName?: boolean;
  /** Аватар — один на серию, у последнего сообщения. */
  showAvatar?: boolean;
  /** Хвостик из низа аватарки — у последнего пузыря серии. */
  tail?: boolean;
}) {
  const align = useChatPrefs((s) => s.align);
  const atEnd = mine && align === 'both';
  // Чужой пузырь — вариант card: БЕЗ рамки, контур ступенью тона поверх зоны
  // (вердикт владельца 14.09.2026, рефы Битрикс24; рамка + SVG-обводка хвоста
  // давали артефакты стыка — пузыри и хвост теперь только заливками).
  const variant = mine ? 'default' : 'card';
  const hasExtra = message.reactions.length > 0 || message.attachments.length > 0;
  const timeRow = (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 font-mono text-[10px] leading-4 tabular-nums',
        mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
      )}
    >
      {message.editedAt ? <span>({ui.chat.edited})</span> : null}
      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
      {mine ? <ReadTicks read={message.readAt !== null} /> : null}
    </span>
  );
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
        {showName ? (
          <MessageHeader>
            <span className="text-[13px] font-semibold text-foreground">
              {message.author.displayName}
            </span>
          </MessageHeader>
        ) : (
          <span className="sr-only">{message.author.displayName}: </span>
        )}
        <Bubble variant={variant}>
          {/* Угол со стороны хвостика — БЕЗ скругления: скруглённый угол
              оставлял собственный бордюр пузыря пересекать основание хвоста
              («пришитый отросток», вердикт владельца 14.09.2026); прямой угол
              накрыт заливкой хвоста, и штрих хвоста продолжает бордюр пузыря
              одной линией (bubble-tail.tsx). */}
          {/* Реакции и вложения — ВНУТРЬ пузыря (вердикт владельца 14.09.2026,
              реф Битрикс24): они расширяют пузырь по высоте, а НЕ висят под
              ним — иначе аватар (self-end) и хвостик отлипали от пузыря к
              строке реакций. Время: в строке текста, когда реакций/вложений
              нет; при их наличии — нижняя строка пузыря справа (как в рефе). */}
          <BubbleContent
            className={cn(
              'relative flex flex-col gap-1',
              tail && (atEnd ? 'rounded-br-none' : 'rounded-bl-none'),
            )}
          >
            <span className="flex items-end gap-2">
              <span className="whitespace-pre-wrap break-words">{message.text}</span>
              {hasExtra ? null : timeRow}
            </span>
            {message.attachments.length > 0 ? <MessageAttachments message={message} /> : null}
            {/* Нижняя строка пузыря: реакции СЛЕВА + время СПРАВА в ОДНОЙ
                строке (вердикт владельца 14.09.2026: «реакции в самом низу,
                не раздувать высоту»; реф Битрикс24). */}
            {hasExtra ? (
              <span className="flex items-center gap-2">
                <MessageReactions message={message} />
                <span className="ml-auto">{timeRow}</span>
              </span>
            ) : null}
          </BubbleContent>
          {/* Хвостик — ПОСЛЕ тела пузыря (вердикт владельца 14.09.2026:
              «вертикальная линия-разделитель»): если рисовать до BubbleContent,
              бордюр пузыря перекрашивает заливку хвоста в стыке и читается
              шов; после — заливка хвоста накрывает угловой стык бордюра, и
              контур идёт одной линией. */}
          {tail ? <BubbleTail side={atEnd ? 'right' : 'left'} variant={variant} /> : null}
        </Bubble>
      </MessageContent>
    </Message>
  );
});
