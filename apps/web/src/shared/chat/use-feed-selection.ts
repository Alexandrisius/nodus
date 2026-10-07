import type { ChatMessage } from '@nodus/contracts';
import { useCallback, useEffect, useMemo } from 'react';

import type { ComposerSelection } from './chat-composer.js';
import { useDeleteDialog, useForwardDialog } from './dialog-stores.js';
import { confirmedIdsOf } from './selection-confirmed.js';
import { useSelectionActive, useSelectedIds, useSelectionStore } from './selection-store.js';
import { copyMessagesAsText, useSelectionKeys } from './use-selection-keys.js';

/**
 * Обвязка режима мультивыбора ленты (A6, #87) — единая для всех хостов
 * (правило одного прохода): порядок ленты для Shift-диапазона, «все свои»
 * для кнопки удаления (логика canDeleteCount tdesktop), клавиатура
 * (Esc/Delete/Ctrl+C), тихое исключение сообщений, удалённых другим
 * участником во время селекта (research-канон).
 *
 * Ключ выделения — clientMessageId, НЕ id записи: при шквальной отправке
 * оптимистичный темп (id = tempId) заменяется серверной записью с ДРУГИМ id —
 * селект по id слетал строка за строкой по мере подтверждения очереди
 * (регрессия #243). clientMessageId стабилен от клика до серверной записи.
 */
export function useFeedSelection(scope: string, items: ChatMessage[], meId?: string) {
  const selectionActive = useSelectionActive(scope);
  const selectedIds = useSelectedIds(scope);
  const orderedIds = useMemo(
    () => items.filter((m) => m.deletedAt === null).map((m) => m.clientMessageId),
    [items],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const getSelectedMessages = useCallback(
    () => items.filter((m) => selectedSet.has(m.clientMessageId)),
    [items, selectedSet],
  );

  const allMine = useMemo(() => {
    if (selectedIds.length === 0) return false;
    return items
      .filter((m) => selectedSet.has(m.clientMessageId))
      .every((m) => m.author.id === meId);
  }, [items, selectedSet, selectedIds.length, meId]);

  useSelectionKeys(scope, selectionActive, getSelectedMessages);

  // Тихое исключение удалённых/исчезнувших из набора (счётчик обновляется).
  useEffect(() => {
    if (!selectionActive) return;
    const store = useSelectionStore.getState();
    for (const id of selectedIds) {
      const message = items.find((m) => m.clientMessageId === id);
      if (!message || message.deletedAt) store.remove(id);
    }
  }, [items, selectionActive, selectedIds]);

  const toggle = useCallback(
    (id: string, shift: boolean) => {
      useSelectionStore.getState().toggle(scope, id, shift, orderedIds);
    },
    [scope, orderedIds],
  );

  return { selectionActive, selectedSet, orderedIds, allMine, getSelectedMessages, toggle };
}

/** Проп selection композера (узкий островок батч-команд, вердикт 24.09):
 *  ids — в порядке ленты; null вне режима. Единая сборка для всех хостов
 *  (правило одного прохода). favoritesEnabled=false — витрина «Избранного»
 *  (звезда-цепочка там — self-reference, #171). deletable — витрина
 *  «Избранного» (#215): любая строка удаляема (запись — удалить, карточку —
 *  снять звезду), не только «все свои». */
export function selectionComposerProps(
  conversationId: string,
  selection: ReturnType<typeof useFeedSelection>,
  favoritesEnabled = true,
  deletable?: boolean,
): ComposerSelection | null {
  if (!selection.selectionActive) return null;
  const keys = selection.orderedIds.filter((id) => selection.selectedSet.has(id));
  const ids = confirmedIdsOf(selection.getSelectedMessages());
  return {
    count: keys.length,
    ids,
    allMine: selection.allMine,
    deletable,
    favoritesEnabled,
    onForward: () => useForwardDialog.getState().open(conversationId, ids),
    onDelete: () => {
      if (ids.length > 0) useDeleteDialog.getState().ask(conversationId, ids);
    },
    onCopy: () => copyMessagesAsText(selection.getSelectedMessages()),
    onClear: () => useSelectionStore.getState().exit(),
  };
}
