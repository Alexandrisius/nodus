import { ui } from '@nodus/contracts';
import type { ChatMessage, FavoriteCard, Paginated } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { chatKeys } from './api.js';
import { plural } from '../lib/format.js';
import { useDeleteDialog } from './dialog-stores.js';
import { favoriteKeys, useNotesConversationId, useRemoveFavorite } from './favorites-api.js';
import { splitNotesSelection } from './notes-flow.js';
import {
  cachedHasLiveReplies,
  useBatchDeleteMessages,
  useDeleteMessage,
} from './message-mutations.js';
import { useSelectionStore } from './selection-store.js';

/**
 * Подтверждение удаления (A5, #87; вердикт владельца 24.09 — «диалог с
 * объяснением», undo-снекбар не в v1). Правило следа (#163, вердикт владельца
 * 30.09 «по ответам»): нет живых ответов — исчезнет бесследно; есть ответы —
 * останется пузырь «Сообщение удалено». Прогноз исхода клиент показывает ПО
 * действию (по кэшу окна ленты; истину решает сервер — ответ мутации
 * реконсилирует кэш). Пакет — всегда диалог со счётчиком; футер без
 * разделителя (канон 24.09).
 *
 * Витрина «Избранного» (#215): удаление из неё Маршрутизируется по типу
 * строки — свои записи удаляются как сообщения (бесследно, см. серверный
 * self-chat гвард), карточки избранного снимаются звездой (оригиналы в
 * исходных чатах не трогаются). Единая точка: сюда сходятся островок селекта,
 * ПКМ «Удалить выделенные» и клавиша Delete.
 */
export function DeleteDialogHost() {
  const request = useDeleteDialog((s) => s.request);
  const close = useDeleteDialog((s) => s.close);
  // Мутации без аргумента-замыкания: conversationId передаётся В ПЕРЕМЕННЫХ
  // (диалог закрывается сразу после mutate — замыкание опустело бы, гонка).
  const single = useDeleteMessage();
  const batch = useBatchDeleteMessages();
  const removeFavorite = useRemoveFavorite();
  const queryClient = useQueryClient();
  const notesId = useNotesConversationId();

  const notesMode = request !== null && request.conversationId === notesId;
  const { noteIds, cardIds } = (() => {
    if (!notesMode || !request) return { noteIds: [], cardIds: [] };
    // Запись витрины = сообщение беседы «Избранного» (кэш её ленты); запись
    // со звездой остаётся записью — удаляется целиком. Второе множество —
    // карточки из кэша избранного: кэш ленты протух (GC/WS) → id без следа
    // в обоих консервативно записью (security-ревью #215), сервер
    // перепроверит автора/беседу.
    const cache = queryClient.getQueryData<Paginated<ChatMessage>>(
      chatKeys.messages(request.conversationId),
    );
    const ids = new Set((cache?.items ?? []).map((m) => m.id));
    const favorites = queryClient.getQueryData<InfiniteData<Paginated<FavoriteCard>>>(
      favoriteKeys.list(),
    );
    const cards = new Set(
      (favorites?.pages ?? []).flatMap((page) => page.items.map((c) => c.messageId)),
    );
    return splitNotesSelection(request.messageIds, ids, cards);
  })();

  const count = request?.messageIds.length ?? 0;
  const isSingle = !notesMode && count === 1;
  const traced =
    isSingle && request && request.messageIds[0]
      ? cachedHasLiveReplies(queryClient, request.conversationId, request.messageIds[0])
      : false;
  const singleNote = notesMode && noteIds.length === 1 && cardIds.length === 0;
  const description = notesMode
    ? cardIds.length > 0
      ? noteIds.length > 0
        ? ui.chat.mixedDeleteHint
        : ui.chat.unfavoriteHint
      : ui.chat.notesTracelessHint
    : isSingle
      ? traced
        ? ui.chat.deleteTraced
        : ui.chat.deleteNoTrace
      : ui.chat.deleteManyHint;
  const title = singleNote
    ? ui.chat.deleteTitle
    : notesMode
      ? `${ui.chat.deleteFromFavoritesConfirm} ${count} ${plural(count, [
          ui.chat.messageOne,
          ui.chat.messageFew,
          ui.chat.messageMany,
        ])}?`
      : isSingle
        ? ui.chat.deleteTitle
        : `${ui.chat.deleteConfirm} ${count} ${plural(count, [
            ui.chat.messageOne,
            ui.chat.messageFew,
            ui.chat.messageMany,
          ])}?`;

  function confirm() {
    if (!request) return;
    if (notesMode) {
      if (noteIds.length === 1) {
        single.mutate({ conversationId: request.conversationId, messageId: noteIds[0]! });
      } else if (noteIds.length > 1) {
        batch.mutate({ conversationId: request.conversationId, messageIds: noteIds });
      }
      for (const id of cardIds) removeFavorite.mutate(id);
    } else if (isSingle && request.messageIds[0]) {
      single.mutate({ conversationId: request.conversationId, messageId: request.messageIds[0] });
    } else {
      batch.mutate({ conversationId: request.conversationId, messageIds: request.messageIds });
    }
    useSelectionStore.getState().exit();
    close();
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="w-full bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {ui.common.cancel}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={count === 0}>
            {ui.chat.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
