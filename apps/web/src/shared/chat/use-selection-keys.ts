import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { useDeleteDialog } from './dialog-stores.js';
import { useSelectionStore } from './selection-store.js';

/** Скопировать выделенные как текст (канон tdesktop «Copy Selected as Text»,
 *  Ctrl+C): строки «Автор: текст» в порядке ленты. */
export function copyMessagesAsText(messages: ChatMessage[]): void {
  const text = messages.map((m) => `${m.author.displayName}: ${m.text}`).join('\n');
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(ui.chat.copied))
    .catch(() => toast.error(ui.common.copyError));
}

/**
 * Клавиатура режима мультивыбора (A6, #87): Esc — выход, Delete — удаление
 * (диалог исхода), Ctrl+C — копировать выделенные как текст (только когда
 * нет текстовой селекции — выделение текста важнее, канон composer-focus).
 * Слушатель живёт только пока режим активен в данной ленте (scope).
 */
export function useSelectionKeys(
  scope: string,
  active: boolean,
  getSelectedMessages: () => ChatMessage[],
): void {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      const store = useSelectionStore.getState();
      if (store.scope !== scope) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        store.exit();
        return;
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        const messages = getSelectedMessages();
        const conversationId = messages[0]?.conversationId;
        if (conversationId) {
          useDeleteDialog.getState().ask(
            conversationId,
            messages.map((m) => m.id),
          );
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return; // текстовая селекция важнее
        event.preventDefault();
        copyMessagesAsText(getSelectedMessages());
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, scope, getSelectedMessages]);
}
