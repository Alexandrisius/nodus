import { SquareArrowOutUpRight } from 'lucide-react';
import type { ConversationListItem, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { ChatPanelToggle } from '../../../shared/chat/chat-side-panel.js';
import { useIsOnline } from '../../../shared/socket/presence-store.js';
import { useTypingStore } from '../../../shared/socket/typing-store.js';
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
 *
 * Подпись живая (realtime #104): «печатает…» перекрывает типовой подзаголовок;
 * в direct статус собеседника — из WS presence (до этого — статичная строка).
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
  const typing = useTypingStore((s) => s.entries[conversation.id] ?? null);
  const typingVisible = typing !== null && typing.expiresAt > Date.now() && typing.userId !== meId;
  const peer = conversation.type === 'direct' ? findPeer(conversation, meId) : null;
  const peerOnline = useIsOnline(peer?.id);

  const subtitle = buildSubtitle(conversation, meId, {
    typingName: typingVisible ? memberName(conversation, typing.userId) : null,
    peerOnline,
  });

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
        <div className="truncate text-xs font-medium text-muted-foreground">{subtitle}</div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {conversation.type === 'task' && conversation.task ? (
          <button
            type="button"
            onClick={() => openCard({ kind: 'task', id: conversation.task?.id ?? '' })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-input hover:text-foreground"
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

function findPeer(conversation: ConversationListItem, meId: string | undefined): UserRef | null {
  return conversation.membersPreview.find((member) => member.id !== meId) ?? null;
}

function memberName(conversation: ConversationListItem, userId: string): string | null {
  return conversation.membersPreview.find((member) => member.id === userId)?.displayName ?? null;
}

/** Подзаголовок: typing > direct presence > типовой (conversations.ts). */
function buildSubtitle(
  conversation: ConversationListItem,
  meId: string | undefined,
  live: { typingName: string | null; peerOnline: boolean },
): string {
  if (live.typingName !== null) {
    // Direct — просто «печатает…»; группа/канал — «Имя печатает…».
    return conversation.type === 'direct' || live.typingName === ''
      ? ui.chat.typing
      : `${live.typingName} ${ui.chat.typing}`;
  }
  if (conversation.type === 'direct' && !isNotesConversation(conversation, meId)) {
    return live.peerOnline ? ui.common.online : ui.chat.offline;
  }
  return conversationSubtitle(conversation);
}
