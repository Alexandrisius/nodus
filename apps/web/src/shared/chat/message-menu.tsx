import { useRef, useState, type ReactNode } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { stripMentionTokens, ui } from '@nodus/contracts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { openCardViaBridge } from '../lib/card-bridge.js';
import { cachedConversation } from './chat-queries.js';
import { useMarkMessageAsResult, useMessageToTask } from './conversation-actions.js';
import { useChatDrafts } from './chat-drafts.js';
import { startMessageEdit } from './message-edit.js';
import { focusComposerWhenFree } from './composer-focus.js';
import { useDeleteDialog, useForwardDialog, useUnpinDialog } from './dialog-stores.js';
import { useAddFavorites, useFavoriteIds, useRemoveFavorite } from './favorites-api.js';
import { buildMessageItems, buildSelectionItems, type MenuItem } from './message-menu-items.js';
import { usePinToggle } from './pin-mutations.js';
import { useSelectionStore } from './selection-store.js';
import { useCanModerateMessages } from './use-can-moderate.js';
import { copyMessagesAsText } from './use-selection-keys.js';
import { ViewersSubmenu } from './viewers-submenu.js';

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
// Состав/порядок пунктов — чистые билдеры message-menu-items.ts, подменю
// «Кто просмотрел» — viewers-submenu.tsx; здесь — хост: сторы, мутации,
// захват фрагмента, исполнение пунктов.

export function MessageMenu({
  message,
  mine,
  conversationId,
  scope,
  replyMode = 'quote',
  onOpenThread,
  messagesOfSelection,
  hideFavorite = false,
  variant,
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
  /** Витрина «Избранного» (#171): звезда внутри — self-reference, пункт скрыт. */
  hideFavorite?: boolean;
  /** Окно-источник «Избранного» (#237): набор Telegram — только копировать/
   *  переслать/выбрать/удалить; команды ленты не показываются. */
  variant?: 'source-window';
  children: ReactNode;
}) {
  const toTask = useMessageToTask();
  const markResult = useMarkMessageAsResult();
  const queryClient = useQueryClient();
  const pinToggle = usePinToggle(conversationId);
  const favoriteIds = useFavoriteIds();
  const addFavorites = useAddFavorites();
  const removeFavorite = useRemoveFavorite();
  const canModerate = useCanModerateMessages(conversationId);
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

  /** Серверные id подтверждённых записей выделения (#243): селект хранит
   *  ключи clientMessageId (стабильны через замену темпа), командам нужны
   *  настоящие id. Порядок = порядок выделения (цепочка «Избранного», #171).
   *  Пересчёт В МОМЕНТ клика: между открытием меню и кликом очередь
   *  могла подтвердить летящие. */
  function confirmedSelectionIds(): string[] {
    const byKey = new Map((messagesOfSelection?.() ?? []).map((m) => [m.clientMessageId, m]));
    return selectedIds.flatMap((key) => {
      const message = byKey.get(key);
      return message && message.seq > 0 ? [message.id] : [];
    });
  }

  /** В выделении есть летящие (#243): серверные команды меню серые (гри-аут
   *  без уведомлений, вердикт владельца 07.10). */
  const selectionPending =
    selectedIds.length > 0 && confirmedSelectionIds().length !== selectedIds.length;

  const isFavorite = favoriteIds.has(message.id);
  const selection = selectionActive
    ? {
        items: buildSelectionItems({
          hideFavorite,
          selectionPending,
          onFavoriteSelected: () => {
            // Порядок цепочки = порядок выделения → поток «Избранного» (#171).
            addFavorites.mutate(confirmedSelectionIds());
            useSelectionStore.getState().exit();
          },
          onForwardSelected: () => {
            const ids = confirmedSelectionIds();
            if (ids.length > 0) useForwardDialog.getState().open(conversationId, ids);
          },
          onDeleteSelected: () => {
            const ids = confirmedSelectionIds();
            if (ids.length > 0) useDeleteDialog.getState().ask(conversationId, ids);
          },
          onCopySelected: () => copyMessagesAsText(messagesOfSelection?.() ?? []),
          onClearSelection: () => useSelectionStore.getState().exit(),
        }),
        showViewers: false,
      }
    : buildMessageItems({
        message,
        mine,
        fragment,
        isFavorite,
        canModerate,
        hideFavorite,
        variant,
        taskId: cachedConversation(queryClient, conversationId)?.task?.id,
        actions: {
          reply: () => {
            if (replyMode === 'thread') {
              onOpenThread?.(message.threadRootId ?? message.id);
              return;
            }
            setReply(null);
          },
          quoteFragment: () => setReply(fragment),
          copy: () => {
            navigator.clipboard
              // Упоминания — отображаемым текстом без разметки (#176).
              .writeText(stripMentionTokens(message.text))
              .then(() => toast.success(ui.chat.copied))
              .catch(() => toast.error(ui.common.copyError));
            // «Вечный курсор» (баг #91): меню гасило фокус композера — возвращаем
            // после освобождения оверлей-слоёв (канон #71).
            focusComposerWhenFree(scope);
          },
          edit: () => {
            // Правка (#188): сообщение с вложениями — окно правки (состав +
            // текст); без вложений — прежний инлайн-режим композера.
            startMessageEdit(scope, message);
            focusComposerWhenFree(scope);
          },
          forward: () => useForwardDialog.getState().open(conversationId, [message.id]),
          toTask: () => {
            toTask.mutate(message, {
              onSuccess: (task) => openCardViaBridge({ kind: 'task', id: task.id }),
            });
          },
          markResult: (taskId) => markResult.mutate({ taskId, message }),
          pin: () => {
            if (message.pinned) {
              // Открепление — диалог: курсор вернёт dialog-hosts после закрытия.
              useUnpinDialog.getState().ask(conversationId, message.id);
              return;
            }
            pinToggle.pin.mutate(message.id);
            focusComposerWhenFree(scope);
          },
          copyLink: () => {
            toast(ui.chat.actionSoon);
            focusComposerWhenFree(scope);
          },
          favorite: () => {
            // Личная закладка-звезда (#171): toggle без диалогов («звезда мгновенна»).
            if (isFavorite) {
              removeFavorite.mutate(message.id);
            } else {
              addFavorites.mutate([message.id]);
            }
            focusComposerWhenFree(scope);
          },
          select: () => useSelectionStore.getState().enter(scope, message.clientMessageId),
          delete: () => useDeleteDialog.getState().ask(conversationId, [message.id]),
        },
      });

  /** #132 р.2: closeFirst-пункты (смена режима селекта) — после ухода меню
   *  (клик по пункту закрывает его; exit-анимация ~100мс + запас). */
  function runItem(item: MenuItem) {
    if (item.disabled) return;
    if (!item.closeFirst) {
      item.run();
      return;
    }
    window.setTimeout(item.run, 170);
  }

  /** #132 р.2: двойной клик по ПУЗРЬКУ = «Ответить» (горячая клавиша
   *  реплая, канон Telegram): по тексту — нативное выделение слова, по
   *  интерактивам и в режиме селекта/каналов — не срабатывает. */
  function replyOnDoubleClick(event: React.MouseEvent) {
    if (replyMode === 'thread' || selectionActive) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;
    if (target.closest('[data-slot="message-text"]')) return;
    if (target.closest('button, a, input, textarea, [contenteditable="true"]')) return;
    setReply(null);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* data-chat-* — координаты для баббла-цитаты выделения
            (selection-quote-bubble): scope/беседа/автор без проп-дрилла. */}
        <span
          ref={triggerRef}
          className="block"
          onContextMenuCapture={(event) => {
            // Меню — ТОЛЬКО по поверхности сообщения (пачка C, вердикт
            // 29.09): пузырь/карточка поста/надгробие/стикер. ПКМ по пустому
            // месту строки ленты не открывает меню: стоп для Radix-триггера
            // (его слушатель — фаза бабблинга этого же span), нативное меню
            // браузера не глушим.
            const target = event.target as HTMLElement | null;
            const onSurface = target?.closest?.(
              // sticker-body/sticker-glyph (#288): плита стикера в ленте
              // переехала на тело «цитата+глиф» (surface остался у постов
              // канала) — ПКМ по стикеру обязан открывать меню как раньше.
              '[data-slot="bubble-content"], [data-slot="post-surface"], [data-slot="message-tombstone"], [data-slot="sticker-surface"], [data-slot="sticker-body"], [data-slot="sticker-glyph"], [data-slot="media-message"]',
            );
            if (!onSurface) {
              event.stopPropagation();
              return;
            }
            captureSelection();
          }}
          onDoubleClick={replyOnDoubleClick}
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
            <ContextMenuItem
              variant={item.danger ? 'destructive' : 'default'}
              disabled={item.disabled}
              onClick={() => runItem(item)}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </ContextMenuItem>
          </span>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const EMPTY_IDS: string[] = [];
