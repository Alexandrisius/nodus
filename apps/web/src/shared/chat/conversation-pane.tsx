import { MessageScrollerProvider } from '@nodus/ui/components/message-scroller';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { MessageGroup } from '@nodus/ui/components/message';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useAuthStore } from '../auth-store.js';
import { ChatComposer } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { MessageMenu } from './message-menu.js';
import { useConversationMessages, useSendChatMessage } from './api.js';
import { ui } from '@nodus/contracts';

/**
 * Обычная беседа (групповой/личный чат, ответы треда): лента сообщений на
 * MessageScroller (авто-скролл, кнопка «вниз») + композер. Действия над
 * сообщением — контекстное меню по правому клику (модель Битрикс24,
 * «Создать задачу» — поток Б). Правая панель беседы — у контейнера
 * (шапка беседы), не у пейна. Пустое состояние — канонический Empty.
 */
export function ConversationPane({
  conversationId,
  showAuthor = true,
  composerPlaceholder = ui.chat.newMessage,
  emptyLabel = ui.chat.directEmpty,
}: {
  conversationId: string;
  showAuthor?: boolean;
  composerPlaceholder?: string;
  emptyLabel?: string;
}) {
  const { data, isLoading } = useConversationMessages(conversationId);
  const send = useSendChatMessage(conversationId);
  const me = useAuthStore((s) => s.user);

  const items = data?.items ?? [];

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
              ) : items.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <Empty>
                    <EmptyTitle>{emptyLabel}</EmptyTitle>
                  </Empty>
                </div>
              ) : (
                <MessageGroup>
                  {items.map((message) => {
                    const mine = message.author.id === me?.id;
                    return (
                      <MessageScrollerItem key={message.id}>
                        <MessageMenu message={message} mine={mine} conversationId={conversationId}>
                          <ChatMessageItem message={message} mine={mine} showAuthor={showAuthor} />
                        </MessageMenu>
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
