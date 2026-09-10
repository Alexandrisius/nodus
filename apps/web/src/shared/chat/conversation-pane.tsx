import { ListTodo } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

import { MessageScrollerProvider } from '@nodus/ui/components/message-scroller';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { MessageGroup } from '@nodus/ui/components/message';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../auth-store.js';
import { ChatComposer } from './chat-composer.js';
import { ChatMessageAction, ChatMessageItem } from './chat-message.js';
import { useConversationMessages, useMessageToTask, useSendChatMessage } from './api.js';
import { ui } from '@nodus/contracts';

/**
 * Обычная беседа (групповой/личный чат, ответы треда): лента сообщений на
 * MessageScroller (авто-скролл, кнопка «вниз») + композер; «В задачу» из
 * сообщения — поток Б (оптимистичное создание задачи).
 */
export function ConversationPane({
  conversationId,
  showAuthor = true,
  composerPlaceholder = ui.chat.newMessage,
}: {
  conversationId: string;
  showAuthor?: boolean;
  composerPlaceholder?: string;
}) {
  const { data, isLoading } = useConversationMessages(conversationId);
  const send = useSendChatMessage(conversationId);
  const toTask = useMessageToTask();
  const me = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1 bg-background">
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {isLoading ? (
                <MessageGroup>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-2/3" />
                  ))}
                </MessageGroup>
              ) : (
                <MessageGroup>
                  {(data?.items ?? []).map((message) => {
                    const mine = message.author.id === me?.id;
                    return (
                      <MessageScrollerItem key={message.id}>
                        <ChatMessageItem
                          message={message}
                          mine={mine}
                          showAuthor={showAuthor}
                          actions={
                            <ChatMessageAction
                              label={ui.chat.toTask}
                              icon={<ListTodo className="size-3" />}
                              onClick={() =>
                                toTask.mutate(
                                  { conversationId, messageId: message.id },
                                  {
                                    onSuccess: (task) =>
                                      void navigate({
                                        to: '/tasks/$taskId',
                                        params: { taskId: task.id },
                                      }),
                                  },
                                )
                              }
                            />
                          }
                        />
                      </MessageScrollerItem>
                    );
                  })}
                </MessageGroup>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <ChatComposer placeholder={composerPlaceholder} onSend={(text) => send.mutate({ text })} />
    </div>
  );
}
