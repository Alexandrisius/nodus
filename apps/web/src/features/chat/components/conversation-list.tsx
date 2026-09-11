import { ListTodo, Megaphone, Users } from 'lucide-react';
import type { ConversationListItem, ConversationType } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { conversationTitle, sortByActivity } from '../lib/conversations.js';

/** Маркер типа беседы на аватаре (список единый, без секций — тип читается
 *  глифом): канал — мегафон, группа — участники, чат задачи — список;
 *  личные — без маркера (аватар собеседника сам по себе). */
const typeIcon: Partial<Record<ConversationType, typeof Megaphone>> = {
  project_channel: Megaphone,
  group: Users,
  task: ListTodo,
};

/**
 * Список бесед мессенджера (механика Телеграма, грамматика «Инструмента»):
 * ЕДИНЫЙ список по активности, БЕЗ секций-заголовков (вердикт владельца
 * 2026-09-10, раунд 2: чаты перемешиваются по свежести) — тип строки читается
 * маркером на аватаре; непрочитанные — чип danger, время и превью —
 * моно/усечённые. Активная беседа — плоская заливка (без теней).
 */
export function ConversationList({
  conversations,
  isLoading,
  activeId,
  emptyLabel,
  onSelect,
}: {
  conversations: ConversationListItem[];
  isLoading: boolean;
  activeId?: string;
  /** Текст пустой вкладки (напр. «Нет активных обсуждений задач»). */
  emptyLabel?: string;
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

  const sorted = sortByActivity(conversations);
  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-3">
        <Empty>
          <EmptyTitle>{emptyLabel}</EmptyTitle>
        </Empty>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-no-scrollbar>
      {sorted.map((conversation) => {
        const active = conversation.id === activeId;
        const TypeIcon = typeIcon[conversation.type];
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
            <span className="relative shrink-0">
              <PersonAvatar
                name={conversationTitle(conversation)}
                avatarUrl={conversation.avatarUrl}
                className="size-9"
              />
              {TypeIcon ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -bottom-0.5 rounded-full bg-sidebar p-0.5 text-muted-foreground"
                >
                  <TypeIcon className="size-3" strokeWidth={1.75} />
                </span>
              ) : null}
            </span>
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
    </div>
  );
}
