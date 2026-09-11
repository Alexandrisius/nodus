import { ArrowLeft } from 'lucide-react';
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

import { useAuthStore } from '../auth-store.js';
import { ChatComposer } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { ChatSidePanel, useChatSidePanel } from './chat-side-panel.js';
import { MessageMenu, MessageMenuButton } from './message-menu.js';
import { useSendChatMessage, useThreadMessages } from './api.js';

/**
 * Тред канала (вердикт владельца): «провалиться внутрь — обычный чат».
 * Шапка — возврат к ленте + моно-метка «Обсуждение»; корневой пост отделён
 * штриховой линией, ответы — обычные сообщения с контекстным меню (правый
 * клик / «⋯»); композер отправляет с threadRootId (уведомления — только
 * участники треда и наблюдатели проекта, бэкенд-механика M13). Правая
 * панель беседы — закон для каждого чата (файлы/ссылки всего канала).
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
  const me = useAuthStore((s) => s.user);
  const panel = useChatSidePanel();

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
                ) : (
                  <MessageGroup>
                    {root ? (
                      <MessageScrollerItem>
                        <MessageMenu
                          message={root}
                          mine={root.author.id === me?.id}
                          conversationId={conversationId}
                        >
                          {(openMenu) => (
                            <ChatMessageItem
                              message={root}
                              mine={root.author.id === me?.id}
                              actions={<MessageMenuButton onOpen={openMenu} />}
                            />
                          )}
                        </MessageMenu>
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
                          <MessageMenu
                            message={message}
                            mine={mine}
                            conversationId={conversationId}
                          >
                            {(openMenu) => (
                              <ChatMessageItem
                                message={message}
                                mine={mine}
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
        placeholder={ui.chat.replyPlaceholder}
        onSend={(text) => send.mutate({ text, threadRootId })}
        onTogglePanel={panel.toggle}
        panelOpen={panel.open}
      />
    </div>
  );
}
