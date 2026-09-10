import { ArrowLeft, ListTodo } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { MessageGroup } from '@nodus/ui/components/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';

import { useOpenCard } from '../../app/shell/use-card-stack.js';
import { useAuthStore } from '../auth-store.js';
import { ChatComposer } from './chat-composer.js';
import { ChatMessageAction, ChatMessageItem } from './chat-message.js';
import { useMessageToTask, useSendChatMessage, useThreadMessages } from './api.js';

/**
 * Тред канала (вердикт владельца): «провалиться внутрь — обычный чат».
 * Шапка — возврат к ленте + моно-метка «Обсуждение»; корневой пост отделён
 * штриховой линией, ответы — обычные сообщения; композер отправляет с
 * threadRootId (уведомления — только участники треда и наблюдатели проекта,
 * бэкенд-механика M13).
 */
export function ThreadPane({
  conversationId,
  threadRootId,
  onBack,
}: {
  conversationId: string;
  threadRootId: string;
  onBack: () => void;
}) {
  const { data, isLoading } = useThreadMessages(conversationId, threadRootId);
  const send = useSendChatMessage(conversationId);
  const toTask = useMessageToTask();
  const me = useAuthStore((s) => s.user);
  const openCard = useOpenCard();

  const items = data?.items ?? [];
  const root = items.find((m) => m.id === threadRootId);
  const replies = items.filter((m) => m.id !== threadRootId);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button variant="ghost" size="icon" aria-label={ui.chat.backToFeed} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <NodeLabel label={ui.chat.discussion} count={replies.length} />
      </header>
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
                  {root ? (
                    <MessageScrollerItem>
                      <ChatMessageItem message={root} mine={root.author.id === me?.id} />
                      <span
                        aria-hidden
                        className="mt-3 block border-b border-dashed border-border"
                      />
                    </MessageScrollerItem>
                  ) : null}
                  {replies.map((message) => {
                    const mine = message.author.id === me?.id;
                    return (
                      <MessageScrollerItem key={message.id}>
                        <ChatMessageItem
                          message={message}
                          mine={mine}
                          actions={
                            <ChatMessageAction
                              label={ui.chat.toTask}
                              icon={<ListTodo className="size-3" />}
                              onClick={() =>
                                toTask.mutate(
                                  { conversationId, messageId: message.id },
                                  {
                                    onSuccess: (task) => openCard({ kind: 'task', id: task.id }),
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
      <ChatComposer
        placeholder={ui.chat.replyPlaceholder}
        onSend={(text) => send.mutate({ text, threadRootId })}
      />
    </div>
  );
}
