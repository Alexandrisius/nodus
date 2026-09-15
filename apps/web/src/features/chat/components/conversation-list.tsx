import { BellOff, Clock, ListTodo, Megaphone, Pin, Users } from 'lucide-react';
import type { ConversationListItem, ConversationType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useAuthStore } from '../../../shared/auth-store.js';
import { formatTime } from '../../../shared/lib/format.js';
import { NotesGlyph } from '../../../shared/ui/notes-glyph.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { conversationTitle, isNotesConversation, sortByActivity } from '../lib/conversations.js';
import { ConversationMenu } from './conversation-menu.js';

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
  const meId = useAuthStore((s) => s.user?.id);

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
          <ConversationMenu key={conversation.id} conversation={conversation}>
            <button
              type="button"
              onClick={() => onSelect(conversation)}
              aria-current={active}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40',
                active && 'bg-accent/60 hover:bg-accent/60',
              )}
            >
              <span className="relative shrink-0">
                {isNotesConversation(conversation, meId) ? (
                  <NotesGlyph className="size-9" />
                ) : (
                  <PersonAvatar
                    name={conversationTitle(conversation, meId)}
                    avatarUrl={conversation.avatarUrl}
                    className="size-9"
                  />
                )}
                {TypeIcon ? (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -bottom-0.5 rounded-full bg-muted p-0.5 text-muted-foreground"
                  >
                    <TypeIcon className="size-3" strokeWidth={1.75} />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-medium">
                      {conversationTitle(conversation, meId)}
                    </span>
                    {/* Состояния из ПКМ-меню (реф Битрикс24): закреп, без
                      звука, «посмотреть позже». */}
                    {conversation.pinned ? (
                      <Pin
                        aria-label={ui.chat.convMenuPin}
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    ) : null}
                    {conversation.muted ? (
                      <BellOff
                        aria-label={ui.chat.convMenuMute}
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    ) : null}
                    {conversation.snoozed ? (
                      <Clock
                        aria-label={ui.chat.convMenuViewLater}
                        className="size-3 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    ) : null}
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
                  {/* «Посмотреть позже» прячет счётчик до нового сообщения. */}
                  {conversation.unreadCount > 0 && !conversation.snoozed ? (
                    <NodeChip tone="danger" className="shrink-0">
                      {conversation.unreadCount}
                    </NodeChip>
                  ) : null}
                </span>
              </span>
            </button>
          </ConversationMenu>
        );
      })}
    </div>
  );
}
