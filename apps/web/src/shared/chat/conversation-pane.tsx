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
import { ChatMessageItem } from './chat-message.js';
import { ChatSidePanel, useChatSidePanel } from './chat-side-panel.js';
import { MessageMenu, MessageMenuButton } from './message-menu.js';
import { useConversationMessages, useSendChatMessage } from './api.js';
import { ui } from '@nodus/contracts';

/**
 * Обычная беседа (групповой/личный чат, ответы треда): лента сообщений на
 * MessageScroller (авто-скролл, кнопка «вниз») + композер. Действия над
 * сообщением — контекстное меню (правый клик / «⋯», модель Битрикс24,
 * раунд 3); «Создать задачу» из сообщения — пункт меню (поток Б).
 * Правая выдвижная панель (файлы/ссылки) — закон для каждого чата.
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
  const panel = useChatSidePanel();

  const items = data?.items ?? [];

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Якорь панели беседы — только зона ленты: композер не перекрывается. */}
      <div className="relative min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller className="h-full bg-background">
            <MessageScrollerViewport>
              <MessageScrollerContent className="p-4">
                {isLoading ? (
                  <MessageGroup>
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-14 w-2/3" />
                    ))}
                  </MessageGroup>
                ) : items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70 uppercase">
                    {emptyLabel}
                  </p>
                ) : (
                  <MessageGroup>
                    {items.map((message) => {
                      const mine = message.author.id === me?.id;
                      return (
                        <MessageScrollerItem key={message.id}>
                          <MessageMenu
                            message={message}
                            mine={mine}
                            conversationId={conversationId}
                          >
                            {(openMenu) => (
                              <ChatMessageItem
                                message={message}
                                mine={mine}
                                showAuthor={showAuthor}
                                actions={<MessageMenuButton onOpen={openMenu} />}
                              />
                            )}
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
        {panel.mounted ? (
          <ChatSidePanel conversationId={conversationId} open={panel.open} onClose={panel.close} />
        ) : null}
      </div>
      <ChatComposer
        placeholder={composerPlaceholder}
        onSend={(text) => send.mutate({ text })}
        onTogglePanel={panel.toggle}
        panelOpen={panel.open}
      />
    </div>
  );
}
