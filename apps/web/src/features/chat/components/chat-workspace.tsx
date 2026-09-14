import { SquareArrowOutUpRight } from 'lucide-react';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import {
  ChatPanelToggle,
  ChatSidePanel,
  useChatSidePanel,
} from '../../../shared/chat/chat-side-panel.js';
import { ChannelView } from '../../../shared/chat/channel-view.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { NotesGlyph } from '../../../shared/ui/notes-glyph.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import {
  conversationSubtitle,
  conversationTitle,
  isNotesConversation,
} from '../lib/conversations.js';

/**
 * Рабочая область беседы — ОДИН код для мессенджера-страницы и карточки чата
 * (стек ADR-0009, вердикт владельца 14.09.2026: чат открывается поверх
 * карточки задачи, не закрывая её): шапка беседы (аватар/закладка, название,
 * подпись, «Открыть задачу», тоггл панели беседы), тело (канал с тредами или
 * личная/групповая лента) и правая панель файлов/ссылок беседы.
 *
 * `compact` — режим карточки: имя и аватар уже в хроме слайдера (канон
 * главного названия), шапка области оставляет подпись и действия. Хранилище
 * открытого треда выбирает хост: страница — search `?thread=` (deep-link),
 * карточка — локальное состояние (чужой маршруту параметр не пишем).
 */
export function ChatWorkspace({
  conversation,
  compact = false,
  threadRootId,
  onOpenThread,
  onCloseThread,
}: {
  conversation: ConversationListItem;
  compact?: boolean;
  threadRootId: string | null;
  onOpenThread: (rootId: string) => void;
  onCloseThread: () => void;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const openCard = useOpenCard();
  // Панель беседы (закон: у каждого чата) — хостится рабочей областью;
  // тоггл — кнопка СПРАВА ВВЕРХУ шапки беседы (канон кнопки «О задаче»).
  const panel = useChatSidePanel();

  return (
    // Панель беседы — ПОЛНОВЫСОТНЫЙ сиблинг всей рабочей области (вердикт
    // владельца 15.09.2026, рефы Битрикс24): занимает ВЕРХНИЙ БАР тоже, её
    // шапка (название + крестик у края) продолжает бар, тоггл уезжает влево.
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'flex shrink-0 items-center gap-3 border-b border-border px-4',
            compact ? 'h-12' : 'h-14',
          )}
        >
          {compact ? (
            <div className="truncate font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {conversationSubtitle(conversation)}
            </div>
          ) : (
            <>
              {isNotesConversation(conversation, meId) ? (
                <NotesGlyph className="size-9 shrink-0" />
              ) : (
                <PersonAvatar
                  name={conversationTitle(conversation, meId)}
                  avatarUrl={conversation.avatarUrl}
                  className="size-9 shrink-0"
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {conversationTitle(conversation, meId)}
                </div>
                <div className="truncate font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  {conversationSubtitle(conversation)}
                </div>
              </div>
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {conversation.type === 'task' && conversation.task ? (
              <button
                type="button"
                onClick={() => openCard({ kind: 'task', id: conversation.task?.id ?? '' })}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-input hover:text-foreground"
              >
                {ui.chat.openTask}
                <SquareArrowOutUpRight className="size-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
            <ChatPanelToggle open={panel.open} onToggle={panel.toggle} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          {conversation.type === 'project_channel' ? (
            <ChannelView
              conversationId={conversation.id}
              threadRootId={threadRootId}
              onOpenThread={onOpenThread}
              onCloseThread={onCloseThread}
            />
          ) : (
            <ConversationPane
              conversationId={conversation.id}
              showAuthor={conversation.type !== 'direct'}
            />
          )}
        </div>
      </div>
      {panel.mounted ? (
        <ChatSidePanel
          conversationId={conversation.id}
          open={panel.open}
          onClose={panel.close}
          title={conversation.type === 'project_channel' ? ui.chat.aboutChannel : ui.chat.aboutChat}
          headerClass={compact ? 'h-12' : 'h-14'}
          threadRootId={threadRootId}
        />
      ) : null}
    </div>
  );
}
