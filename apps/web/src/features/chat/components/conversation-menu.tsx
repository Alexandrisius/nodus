import { BellOff, BellRing, Clock, EyeOff, Pin, PinOff } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';

import { useUpdateConversation } from '../api/chat-api.js';

/**
 * Контекстное меню беседы (ПКМ по строке списка, реф Битрикс24, вердикт
 * владельца 14.09.2026): «Посмотреть позже» / закрепить / выключить звук /
 * скрыть. Порядок пунктов — как в рефе; состояния читаются на строке
 * (глифы и счётчик), меню отражает текущее состояние глаголом
 * (Закрепить ⇄ Открепить, Выключить ⇄ Включить звук).
 */
export function ConversationMenu({
  conversation,
  children,
}: {
  conversation: ConversationListItem;
  children: ReactNode;
}) {
  const update = useUpdateConversation();

  function patch(body: Parameters<typeof update.mutate>[0]['body']) {
    update.mutate({ id: conversation.id, body });
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => patch({ snoozed: !conversation.snoozed })}>
          <Clock className="size-4" strokeWidth={1.75} />
          {ui.chat.convMenuViewLater}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => patch({ pinned: !conversation.pinned })}>
          {conversation.pinned ? (
            <PinOff className="size-4" strokeWidth={1.75} />
          ) : (
            <Pin className="size-4" strokeWidth={1.75} />
          )}
          {conversation.pinned ? ui.chat.convMenuUnpin : ui.chat.convMenuPin}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => patch({ muted: !conversation.muted })}>
          {conversation.muted ? (
            <BellRing className="size-4" strokeWidth={1.75} />
          ) : (
            <BellOff className="size-4" strokeWidth={1.75} />
          )}
          {conversation.muted ? ui.chat.convMenuUnmute : ui.chat.convMenuMute}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => patch({ hidden: true })}>
          <EyeOff className="size-4" strokeWidth={1.75} />
          {ui.chat.convMenuHide}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
