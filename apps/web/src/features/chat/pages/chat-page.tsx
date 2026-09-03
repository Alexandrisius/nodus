import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { Badge } from '@nodus/ui/components/badge';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useConversations } from '../api/chat-api.js';
import { ChatThread, conversationTitle } from '../components/chat-thread.js';

/** Мессенджер: список диалогов слева + тред справа (механика Телеграма). */
export function ChatPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const { data, isLoading } = useConversations();
  const navigate = useNavigate();

  const active = data?.items.find((c) => c.id === conversationId);

  return (
    <div className="relative flex h-full">
      <aside className="paper-surface flex w-80 shrink-0 flex-col border-r">
        <header className="flex h-14 shrink-0 items-center px-4">
          <h1 className="text-lg font-semibold">{ui.chat.title}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-2 h-14" />)
            : (data?.items ?? []).map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() =>
                    void navigate({
                      to: '/chat/$conversationId',
                      params: { conversationId: conversation.id },
                    })
                  }
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60',
                    conversation.id === conversationId && 'bg-accent',
                  )}
                >
                  <PersonAvatar name={conversationTitle(conversation)} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {conversationTitle(conversation)}
                      </span>
                      {conversation.lastMessage && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(conversation.lastMessage.createdAt)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {conversation.lastMessage?.text ?? ui.common.empty}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge variant="secondary" className="bg-info-soft text-info">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              ))}
        </div>
      </aside>

      {active ? (
        <ChatThread conversation={active} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-foreground">
          <Empty>
            <EmptyTitle>{ui.chat.conversations}</EmptyTitle>
          </Empty>
        </div>
      )}
      <Outlet />
    </div>
  );
}
