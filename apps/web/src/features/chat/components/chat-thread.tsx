import { ListTodo, SendHorizonal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';
import { Textarea } from '@nodus/ui/components/textarea';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Message, MessageContent } from '@nodus/ui/components/message';
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@nodus/ui/components/attachment';
import { FileText } from 'lucide-react';

import { formatTime } from '../../../shared/lib/format.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useConversationMessages, useMessageToTask, useSendMessage } from '../api/chat-api.js';

export function conversationTitle(conversation: ConversationListItem): string {
  return conversation.title ?? conversation.membersPreview[0]?.displayName ?? '';
}

/** Тред чата: сообщения (примитивы shadcn), «В задачу», оптимистичная отправка. */
export function ChatThread({ conversation }: { conversation: ConversationListItem }) {
  const { data } = useConversationMessages(conversation.id);
  const send = useSendMessage(conversation.id);
  const toTask = useMessageToTask();
  const me = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [text, setText] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setText('');
    send.mutate(trimmed);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background/30">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-cream/10 bg-background/60 px-4 backdrop-blur-sm">
        <PersonAvatar name={conversationTitle(conversation)} className="size-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{conversationTitle(conversation)}</div>
          <div className="text-xs text-muted-foreground">
            {conversation.type === 'project_channel'
              ? ui.chat.channelOfProject
              : conversation.type === 'group'
                ? ui.chat.groupChat
                : ui.common.online}
          </div>
        </div>
      </header>

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {(data?.items ?? []).map((message) => {
                const mine = message.author.id === me?.id;
                return (
                  <MessageScrollerItem key={message.id}>
                    <Message align="start" className="group/msg">
                      <PersonAvatar
                        name={message.author.displayName}
                        className="size-8 shrink-0 self-start"
                      />
                      <MessageContent>
                        <div
                          className={cn(
                            'relative w-fit max-w-[70%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap shadow-[2px_3px_0_rgb(14_27_21/0.35)] after:absolute after:-left-1.5 after:bottom-1 after:size-3 after:bg-inherit after:[clip-path:polygon(100%_0,0_100%,100%_100%)]',
                            mine ? 'bg-sage text-cream' : 'bg-card text-card-foreground',
                          )}
                        >
                          {conversation.type !== 'direct' && (
                            <div
                              className={cn(
                                'mb-0.5 text-xs font-semibold',
                                mine ? 'text-cream/80' : 'text-rust',
                              )}
                            >
                              {message.author.displayName}
                            </div>
                          )}
                          {message.text}
                          {message.editedAt && (
                            <span className="ml-1 text-xs opacity-60">({ui.chat.edited})</span>
                          )}
                          <span className="float-right ml-3 mt-1.5 text-[10px] opacity-60">
                            {formatTime(message.createdAt)}
                          </span>
                        </div>
                        {message.reactions.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {message.reactions.map((reaction) => (
                              <span
                                key={reaction.emoji}
                                className="rounded-full bg-cream/15 px-2 py-0.5 text-xs text-cream"
                              >
                                {reaction.emoji} {reaction.count}
                              </span>
                            ))}
                          </div>
                        )}
                        {message.attachments.length > 0 && (
                          <AttachmentGroup className="mt-1 flex-wrap">
                            {message.attachments.map((file) => (
                              <Attachment key={file.id} size="sm">
                                <AttachmentMedia>
                                  <FileText />
                                </AttachmentMedia>
                                <AttachmentContent>
                                  <AttachmentTitle>{file.name}</AttachmentTitle>
                                </AttachmentContent>
                              </Attachment>
                            ))}
                          </AttachmentGroup>
                        )}
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-xs text-foreground/60 opacity-0 transition-opacity group-hover/msg:opacity-100 hover:text-cream"
                          onClick={() =>
                            toTask.mutate(
                              { conversationId: conversation.id, messageId: message.id },
                              {
                                onSuccess: (task) => {
                                  toast.success(ui.chat.toTaskDone);
                                  void navigate({
                                    to: '/tasks/$taskId',
                                    params: { taskId: task.id },
                                  });
                                },
                              },
                            )
                          }
                        >
                          <ListTodo className="size-3.5" />
                          {ui.chat.toTask}
                        </button>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-cream/10 bg-background/60 p-3 backdrop-blur-sm"
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ui.chat.newMessage}
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
