import type { ConversationListItem } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { conversationSections, conversationTitle } from '../lib/conversations.js';

/**
 * Список бесед мессенджера (механика Телеграма, грамматика «Инструмента»):
 * плоские строки на рейке-сайдбаре, секции «Каналы / Групповые чаты / Личные»
 * моно-метками, непрочитанные — чип danger, время и превью — моно/усечённые.
 * Активная беседа — плоская заливка (без теней и «приподниманий»).
 */
export function ConversationList({
  conversations,
  isLoading,
  activeId,
  onSelect,
}: {
  conversations: ConversationListItem[];
  isLoading: boolean;
  activeId?: string;
  onSelect: (conversation: ConversationListItem) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-no-scrollbar>
      {conversationSections.map((section) => {
        const items = conversations.filter((c) => c.type === section.key);
        if (items.length === 0) return null;
        return (
          <section key={section.key}>
            <div className="px-4 pt-3 pb-1">
              <NodeLabel label={section.label} count={items.length} />
            </div>
            {items.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelect(conversation)}
                  aria-current={active}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40',
                    active && 'bg-accent/60 hover:bg-accent/60',
                  )}
                >
                  <PersonAvatar
                    name={conversationTitle(conversation)}
                    avatarUrl={conversation.avatarUrl}
                    className="size-9 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {conversationTitle(conversation)}
                      </span>
                      {conversation.lastMessage ? (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                          {formatTime(conversation.lastMessage.createdAt)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {conversation.lastMessage?.text ?? ''}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <NodeChip tone="danger" className="shrink-0">
                          {conversation.unreadCount}
                        </NodeChip>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
