import { ArrowUpRight, Copy, Forward, Star } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import type { FavoriteCard } from '@nodus/contracts';
import { stripMentionTokens, ui } from '@nodus/contracts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';
import { toast } from 'sonner';

import { useChatHostNavigation } from './chat-host.js';
import { useForwardDialog } from './dialog-stores.js';
import { useRemoveFavorite } from './favorites-api.js';
import { useJumpStore } from './jump-store.js';
/**
 * ПКМ-меню карточки избранного в витрине «Избранного» (#171, ревизия 04.10:
 * действий на пузыре НЕТ — только контекстное меню, как у сообщений):
 * прыжок к оригиналу, копирование текста, пересылка, снятие звезды.
 * Поверхность — та же, что у MessageMenu (пузырь/надгробие/медиа).
 */
export function FavoriteMenu({ card, children }: { card: FavoriteCard; children: ReactNode }) {
  const remove = useRemoveFavorite();
  const nav = useChatHostNavigation();
  const triggerRef = useRef<HTMLSpanElement>(null);

  function showInChat() {
    useJumpStore.getState().request(card.conversationId, card.messageId, card.threadRootId);
    if (nav) nav.openConversation(card.conversationId, card.threadRootId);
    else toast(ui.chat.jumpNotFound);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span
          ref={triggerRef}
          className="block"
          onContextMenuCapture={(event) => {
            const target = event.target as HTMLElement | null;
            const onSurface = target?.closest?.(
              '[data-slot="bubble-content"], [data-slot="message-tombstone"], [data-slot="sticker-surface"], [data-slot="media-message"]',
            );
            if (!onSurface) {
              event.stopPropagation();
              return;
            }
          }}
          data-chat-message={card.messageId}
          data-favorite-card={card.messageId}
        >
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {!card.obliterated ? (
          <ContextMenuItem onClick={showInChat}>
            <ArrowUpRight className="size-4" strokeWidth={1.75} />
            {ui.chat.showInChat}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onClick={() => {
            navigator.clipboard
              // Упоминания — отображаемым текстом без разметки (#176).
              .writeText(stripMentionTokens(card.text))
              .then(() => toast.success(ui.chat.copied))
              .catch(() => toast.error(ui.common.copyError));
          }}
        >
          <Copy className="size-4" strokeWidth={1.75} />
          {ui.chat.menu.copy}
        </ContextMenuItem>
        {!card.deletedAt ? (
          <ContextMenuItem
            onClick={() => useForwardDialog.getState().open(card.conversationId, [card.messageId])}
          >
            <Forward className="size-4" strokeWidth={1.75} />
            {ui.chat.menu.forward}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem variant="destructive" onClick={() => remove.mutate(card.messageId)}>
          <Star className="size-4" strokeWidth={1.75} />
          {ui.chat.unfavorite}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
