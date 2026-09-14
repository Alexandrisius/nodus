import { FileText } from 'lucide-react';
import { memo } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Message, MessageContent, MessageHeader } from '@nodus/ui/components/message';
import { Bubble, BubbleContent } from '@nodus/ui/components/bubble';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@nodus/ui/components/attachment';

import { formatTime } from '../lib/format.js';
import { useChatPrefs } from './chat-prefs.js';
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
 * Сообщение чата по канону «Инструмента» (Message/Bubble-примитивы, как
 * обсуждение задачи): выравнивание — НАСТРОЙКА пользователя (вердикт
 * владельца 14.09.2026, модель Телеграма/Битрикс24, `chat-prefs.ts`):
 * 'one' (дефолт) — все сообщения с одной стороны, свои с аватаром рядом с
 * собеседником (широкую ленту с пузырями по разным краям неудобно читать);
 * 'both' — классика: свои справа (primary-пузырь), чужие слева. Реакции и
 * вложения — под пузырём; действия над сообщением — контекстное меню по
 * правому клику (MessageMenu, без кнопок на сообщении — вердикт владельца).
 */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  mine,
  showAuthor = true,
}: {
  message: ChatMessage;
  mine: boolean;
  /** В личных диалогах имя автора можно опустить. */
  showAuthor?: boolean;
}) {
  const align = useChatPrefs((s) => s.align);
  const oneSide = align === 'one';
  return (
    <Message align={mine && !oneSide ? 'end' : 'start'} className="group/msg">
      {!mine || oneSide ? (
        <PersonAvatar name={message.author.displayName} className="size-7" />
      ) : null}
      <MessageContent>
        <MessageHeader className="gap-1.5">
          {showAuthor || mine ? (
            <span className="text-foreground">{message.author.displayName}</span>
          ) : null}
          <span className="font-mono text-[11px] tabular-nums">
            {formatTime(message.createdAt)}
          </span>
          {message.editedAt ? (
            <span className="font-mono text-[10px] text-muted-foreground">({ui.chat.edited})</span>
          ) : null}
        </MessageHeader>
        <Bubble variant={mine ? 'default' : 'outline'}>
          <BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent>
        </Bubble>
        <MessageReactions message={message} />
        <MessageAttachments message={message} />
      </MessageContent>
    </Message>
  );
});
