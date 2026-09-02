import { SendHorizonal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Textarea } from '@nodus/ui/components/textarea';
import { Message, MessageContent, MessageGroup, MessageHeader } from '@nodus/ui/components/message';
import { Bubble, BubbleContent } from '@nodus/ui/components/bubble';
import { Attachment, AttachmentGroup, AttachmentTitle } from '@nodus/ui/components/attachment';

import { formatTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useSendTaskMessage, useTaskMessages } from '../api/tasks-api.js';

/** Обсуждение задачи (правая панель карточки): тред + оптимистичная отправка. */
export function TaskDiscussion({ taskId }: { taskId: string }) {
  const { data } = useTaskMessages(taskId);
  const send = useSendTaskMessage(taskId);
  const [text, setText] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setText('');
    send.mutate(trimmed);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <MessageGroup>
          {(data?.items ?? []).map((message) => (
            <Message key={message.id} align="start">
              <PersonAvatar name={message.author.displayName} className="size-7" />
              <MessageContent>
                <MessageHeader className="gap-1">
                  <span className="text-foreground">{message.author.displayName}</span>
                  <span>{formatTime(message.createdAt)}</span>
                </MessageHeader>
                <Bubble variant="ghost">
                  <BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent>
                </Bubble>
                {message.attachments.length > 0 && (
                  <AttachmentGroup>
                    {message.attachments.map((file) => (
                      <Attachment key={file.id}>
                        <AttachmentTitle>{file.name}</AttachmentTitle>
                      </Attachment>
                    ))}
                  </AttachmentGroup>
                )}
              </MessageContent>
            </Message>
          ))}
        </MessageGroup>
      </div>
      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ui.tasks.addComment}
          rows={2}
          className="min-h-9 flex-1 resize-none"
        />
        <Button type="submit" size="icon" disabled={!text.trim()} aria-label={ui.tasks.send}>
          <SendHorizonal />
        </Button>
      </form>
    </div>
  );
}
