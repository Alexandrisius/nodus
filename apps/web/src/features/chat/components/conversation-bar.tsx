import { SquareArrowOutUpRight } from 'lucide-react';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { ChatPanelToggle } from '../../../shared/chat/chat-side-panel.js';
import { NotesGlyph } from '../../../shared/ui/notes-glyph.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import {
  conversationSubtitle,
  conversationTitle,
  isNotesConversation,
} from '../lib/conversations.js';

/**
 * Бар беседы: аватар/закладка, название, подпись, «Открыть задачу», тоггл
 * панели беседы СПРАВА (канон кнопки «О задаче»). Живёт в колонке ленты
 * хоста: при открытии окна треда сжимается вместе с лентой — тоггл стоит
 * на правом краю ЛЕНТЫ (вердикт владельца 15.09.2026); при открытии панели
 * уезжает влево по закону панели.
 */
export function ConversationBar({
  conversation,
  panelOpen,
  onPanelToggle,
}: {
  conversation: ConversationListItem;
  panelOpen: boolean;
  onPanelToggle: () => void;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const openCard = useOpenCard();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
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
        <ChatPanelToggle open={panelOpen} onToggle={onPanelToggle} />
      </div>
    </header>
  );
}
