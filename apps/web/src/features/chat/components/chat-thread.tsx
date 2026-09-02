import { ListTodo, SendHorizonal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';
import { Button } from '@nodus/ui/components/button';
import { Textarea } from '@nodus/ui/components/textarea';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Message, MessageContent, MessageHeader } from '@nodus/ui/components/message';
import { Bubble, BubbleContent, BubbleReactions } from '@nodus/ui/components/bubble';
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
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#E8EEF6]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-900/10 bg-white/80 px-4 backdrop-blur">
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
                    <Message align={mine ? 'end' : 'start'} className="group/msg">
                      {!mine && (
                        <PersonAvatar name={message.author.displayName} className="size-8" />
                      )}
                      <MessageContent>
                        {!mine && (
                          <MessageHeader className="gap-1">
                            <span className="text-foreground">{message.author.displayName}</span>
                            <span>{formatTime(message.createdAt)}</span>
                          </MessageHeader>
                        )}
                        <Bubble variant={mine ? 'default' : 'outline'}>
                          <BubbleContent className="whitespace-pre-wrap">
                            {message.text}
                            {message.editedAt && (
                              <span className="ml-1 text-xs opacity-60">({ui.chat.edited})</span>
                            )}
                          </BubbleContent>
                          {message.reactions.length > 0 && (
                            <BubbleReactions align={mine ? 'end' : 'start'}>
                              {message.reactions.map((reaction) => (
                                <span key={reaction.emoji} className="px-1 text-xs">
                                  {reaction.emoji} {reaction.count}
                                </span>
                              ))}
                            </BubbleReactions>
                          )}
                        </Bubble>
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
                          className="mt-1 hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground group-hover/msg:flex"
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
        className="flex shrink-0 items-end gap-2 border-t border-slate-900/10 bg-white/80 p-3 backdrop-blur"
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
