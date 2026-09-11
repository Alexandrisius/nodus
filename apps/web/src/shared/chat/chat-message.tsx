import { FileText } from 'lucide-react';
import { memo, type ReactNode } from 'react';
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
 * обсуждение задачи): свои — справа (primary-пузырь, без аватара), чужие —
 * слева (аватар + outline-пузырь); автор и время — моно-хедер; реакции и
 * вложения — под пузырём; ховер-действия — слот потребителя.
 */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  mine,
  showAuthor = true,
  actions,
}: {
  message: ChatMessage;
  mine: boolean;
  /** В личных диалогах имя автора можно опустить. */
  showAuthor?: boolean;
  actions?: ReactNode;
}) {
  return (
    <Message align={mine ? 'end' : 'start'} className="group/msg">
      {!mine ? <PersonAvatar name={message.author.displayName} className="size-7" /> : null}
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
        {actions ? (
          <span className="flex opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
            {actions}
          </span>
        ) : null}
      </MessageContent>
    </Message>
  );
});
