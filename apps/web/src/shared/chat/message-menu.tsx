import {
  CheckSquare,
  Copy,
  Eye,
  Forward,
  Link2,
  ListTodo,
  Pencil,
  Pin,
  Quote,
  Reply,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { ChatMessage, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';
import { toast } from 'sonner';

import { openCardViaBridge } from '../lib/card-bridge.js';
import { shortPersonName } from '../lib/format.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { useMessageToTask } from './api.js';
import { useChatDrafts } from './chat-drafts.js';
import { focusComposerWhenFree } from './composer-focus.js';
import { useDeleteDialog, useForwardDialog, useUnpinDialog } from './dialog-stores.js';
import { usePinToggle } from './message-mutations.js';
import { useSelectionStore } from './selection-store.js';
import { copyMessagesAsText } from './use-selection-keys.js';

/**
 * Реестр действий над сообщением (вердикт владельца 2026-09-11, раунд 3 —
 * модель контекстного меню Битрикс24; линия A #87 сняла заглушки): пункты и
 * порядок зафиксированы, «Копировать ссылку»/«В избранное» остаются stub до
 * соответствующих треков. Новая серверная возможность = обработчик в реестре,
 * меню не меняется. В режиме мультивыбора (A6) меню переключается на действия
 * над выделенными (канон tdesktop: Forward Selected / Delete Selected /
 * Clear Selection).
 *
 * «Цитировать фрагмент» (частичная цитата, Replies 2.0 — вердикт 24.09):
 * пункт появляется, когда контекстное меню открыто с несвёрнутым выделением
 * текста внутри этого сообщения (захват — в capture-фазе contextmenu, до
 * открытия меню; «вечный курсор» селекцию не сбрасывает — канон #71).
 *
 * «Кто просмотрел» (раунд 4, спека владельца): ПОДМЕНЮ в группе
 * недеструктивных команд, сразу над «Удалить» — список посмотревших
 * (аватар + ФИО, max-h-56 со скроллом) из message.readBy. Прежний пункт с
 * попапом «мгновенно пропадал» (война фокуса с «вечным курсором»): подменю —
 * часть слоя меню, фокус не воюет. Попап у счётчика «и ещё N» в pill'е
 * просмотров (views-line) не тронут.
 */

interface Item {
  id: string;
  icon: typeof Reply;
  label: string;
  danger?: boolean;
  separatorBefore?: boolean;
  run: () => void;
}
// >300 строк — обоснование (I5): реестр действий + подменю «Кто просмотрел»
// (раунд 4) — единая структура ОДНОГО меню (порядок пунктов зафиксирован
// вердиктом); вынос подменю размывал бы условие вставки «над "Удалить"».

export function MessageMenu({
  message,
  mine,
  conversationId,
  scope,
  replyMode = 'quote',
  onOpenThread,
  messagesOfSelection,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  conversationId: string;
  /** draftKey ленты-владельца (`conversation:<id>` / `feed:<id>` / `thread:<rootId>`). */
  scope: string;
  /** Лента канала: «Ответить» открывает тред (канон), не цитату. */
  replyMode?: 'quote' | 'thread';
  onOpenThread?: (rootId: string) => void;
  /** Выделенные сообщения ленты (меню режима селекта: копировать/удалить). */
  messagesOfSelection?: () => ChatMessage[];
  children: ReactNode;
}) {
  const toTask = useMessageToTask();
  const pinToggle = usePinToggle(conversationId);
  const selectionActive = useSelectionStore((s) => s.scope === scope && s.ids.length > 0);
  const selectedIds = useSelectionStore((s) => (s.scope === scope ? s.ids : EMPTY_IDS));
  const [fragment, setFragment] = useState<string | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  function captureSelection() {
    const selection = window.getSelection();
    const trigger = triggerRef.current;
    if (!selection || selection.isCollapsed || !trigger) {
      setFragment(null);
      return;
    }
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const inside = anchor && focus && trigger.contains(anchor) && trigger.contains(focus);
    setFragment(inside ? selection.toString().trim() || null : null);
  }

  function setReply(quoteText?: string | null) {
    useChatDrafts.getState().setReply(scope, message, quoteText);
    focusComposerWhenFree(scope);
    if (quoteText) window.getSelection()?.removeAllRanges();
  }

  function selectionItems(): Item[] {
    const selected = selectedIds;
    return [
      {
        id: 'forwardSelected',
        icon: Forward,
        label: ui.chat.forwardSelected,
        run: () => useForwardDialog.getState().open(conversationId, selected),
      },
      {
        id: 'deleteSelected',
        icon: Trash2,
        label: ui.chat.deleteSelected,
        danger: true,
        run: () => useDeleteDialog.getState().ask(conversationId, selected),
      },
      {
        id: 'copySelected',
        icon: Copy,
        label: ui.chat.copySelected,
        run: () => copyMessagesAsText(messagesOfSelection?.() ?? []),
      },
      {
        id: 'toggleThis',
        icon: CheckSquare,
        label: selected.includes(message.id) ? ui.chat.deselectOne : ui.chat.selectOne,
        run: () => useSelectionStore.getState().toggle(scope, message.id),
      },
      {
        id: 'clearSelection',
        icon: X,
        label: ui.chat.clearSelection,
        separatorBefore: true,
        run: () => useSelectionStore.getState().exit(),
      },
    ];
  }

  function normalItems(): { items: Item[]; showViewers: boolean } {
    const items: Item[] = [
      {
        id: 'reply',
        icon: Reply,
        label: ui.chat.menu.reply,
        run: () => {
          if (replyMode === 'thread') {
            onOpenThread?.(message.threadRootId ?? message.id);
            return;
          }
          setReply(null);
        },
      },
    ];
    if (fragment) {
      items.push({
        id: 'quoteFragment',
        icon: Quote,
        label: ui.chat.quoteFragment,
        run: () => setReply(fragment),
      });
    }
    items.push(
      {
        id: 'copy',
        icon: Copy,
        label: ui.chat.menu.copy,
        run: () => {
          navigator.clipboard
            .writeText(message.text)
            .then(() => toast.success(ui.chat.copied))
            .catch(() => toast.error(ui.common.copyError));
          // «Вечный курсор» (баг #91): меню гасило фокус композера — возвращаем
          // после освобождения оверлей-слоёв (канон #71).
          focusComposerWhenFree(scope);
        },
      },
      {
        id: 'edit',
        icon: Pencil,
        label: ui.chat.menu.edit,
        run: () => {
          useChatDrafts.getState().setEdit(scope, message);
          focusComposerWhenFree(scope);
        },
      },
      {
        id: 'forward',
        icon: Forward,
        label: ui.chat.menu.forward,
        run: () => useForwardDialog.getState().open(conversationId, [message.id]),
      },
      {
        id: 'toTask',
        icon: ListTodo,
        label: ui.chat.menu.createTask,
        run: () => {
          toTask.mutate(
            { conversationId, messageId: message.id },
            { onSuccess: (task) => openCardViaBridge({ kind: 'task', id: task.id }) },
          );
        },
      },
      {
        id: 'pin',
        icon: Pin,
        label: message.pinned ? ui.chat.unpin : ui.chat.menu.pin,
        run: () => {
          if (message.pinned) {
            // Открепление — диалог: курсор вернёт dialog-hosts после закрытия.
            useUnpinDialog.getState().ask(conversationId, message.id);
            return;
          }
          pinToggle.pin.mutate(message.id);
          focusComposerWhenFree(scope);
        },
      },
      {
        id: 'copyLink',
        icon: Link2,
        label: ui.chat.menu.copyLink,
        run: () => {
          toast(ui.chat.actionSoon);
          focusComposerWhenFree(scope);
        },
      },
      {
        id: 'favorite',
        icon: Star,
        label: ui.chat.menu.favorite,
        run: () => {
          toast(ui.chat.actionSoon);
          focusComposerWhenFree(scope);
        },
      },
      {
        id: 'select',
        icon: CheckSquare,
        label: ui.chat.menu.select,
        run: () => useSelectionStore.getState().enter(scope, message.id),
      },
      {
        id: 'delete',
        icon: Trash2,
        label: ui.chat.menu.delete,
        danger: true,
        separatorBefore: true,
        run: () => useDeleteDialog.getState().ask(conversationId, [message.id]),
      },
    );
    // Пересланную копию нельзя править даже автору пересылки (#111): текст
    // принадлежит оригинальному автору; удалять свою копию — можно.
    const editable = mine && !message.forwardedFrom;
    return {
      items: items.filter((item) => {
        if (item.id === 'edit') return editable;
        return !MINE_ONLY.has(item.id) || mine;
      }),
      // «Кто просмотрел» — подменю (раунд 4): только свои живые сообщения с
      // непустым readBy (просмотры видит автор; пустой список показывать
      // нечего). Вставляется над «Удалить» (недеструктивная группа).
      showViewers: mine && !message.deletedAt && message.readBy.length > 0,
    };
  }

  const selection = selectionActive
    ? { items: selectionItems(), showViewers: false }
    : normalItems();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* data-chat-* — координаты для баббла-цитаты выделения
            (selection-quote-bubble): scope/беседа/автор без проп-дрилла. */}
        <span
          ref={triggerRef}
          className="block"
          onContextMenuCapture={captureSelection}
          data-chat-message={message.id}
          data-chat-scope={scope}
          data-chat-conversation={conversationId}
        >
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {selection.items.map((item) => (
          <span key={item.id}>
            {/* Подменю «Кто просмотрел» — над «Удалить», до сепаратора
                деструктивной группы (раунд 4, спека владельца). */}
            {item.id === 'delete' && selection.showViewers ? (
              <ViewersSubmenu viewers={message.readBy} />
            ) : null}
            {item.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem variant={item.danger ? 'destructive' : 'default'} onClick={item.run}>
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </ContextMenuItem>
          </span>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Список посмотревших в подменю «Кто просмотрел»: та же композиция строк,
 *  что в попапе pill'а просмотров (views-line) — аватар + ФИО, скролл для
 *  длинных списков. Часть слоя меню: не воюет с «вечным курсором». */
function ViewersSubmenu({ viewers }: { viewers: readonly UserRef[] }) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Eye className="size-4" strokeWidth={1.75} />
        {ui.chat.whoViewed}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-max min-w-44 p-1">
        <div data-slot="views-submenu-list" className="max-h-56 overflow-y-auto px-0.5">
          {viewers.map((viewer) => (
            <span key={viewer.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
              <PersonAvatar
                name={viewer.displayName}
                avatarUrl={viewer.avatarUrl}
                className="size-6 shrink-0"
              />
              <span className="min-w-0 truncate text-sm">
                {shortPersonName(viewer.displayName)}
              </span>
            </span>
          ))}
        </div>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

const EMPTY_IDS: string[] = [];
const MINE_ONLY = new Set(['edit', 'delete']);
