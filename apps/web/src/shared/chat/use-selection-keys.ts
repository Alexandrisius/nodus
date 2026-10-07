import type { ChatMessage } from '@nodus/contracts';
import { stripMentionTokens, ui } from '@nodus/contracts';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { withoutPatronymic } from '../lib/format.js';
import { useDeleteDialog } from './dialog-stores.js';
import { confirmedIdsOf } from './selection-confirmed.js';
import { useSelectionStore } from './selection-store.js';

/** Скопировать выделенные как текст (канон tdesktop «Copy Selected as Text»,
 *  Ctrl+C): строки «Автор: текст» в порядке ленты; упоминания — отображаемым
 *  текстом без разметки (#176). */
export function copyMessagesAsText(messages: ChatMessage[]): void {
  const text = messages
    .map((m) => `${withoutPatronymic(m.author.displayName)}: ${stripMentionTokens(m.text)}`)
    .join('\n');
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
      // Фокус в поле ввода или открытом оверлей-слое (диалог удаления и т.п.)
      // — клавиши принадлежат им: Delete в поиске не должен открывать диалог
      // удаления, Esc диалога не должен снимать селект (баг-находка
      // валидатора 24.09).
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input, textarea, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
        )
      ) {
        return;
      }
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
          // Батч-командам — подтверждённые id (летящие темпы #243 исключает
          // confirmedIdsOf с тостом-подсказкой).
          const ids = confirmedIdsOf(messages);
          if (ids.length > 0) useDeleteDialog.getState().ask(conversationId, ids);
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
