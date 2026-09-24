import { useMemo } from 'react';
import type { ChatMessage, Paginated } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { useQueryClient } from '@tanstack/react-query';

import { plural } from '../lib/format.js';
import { chatKeys } from './api.js';
import { useDeleteDialog } from './dialog-stores.js';
import { useBatchDeleteMessages, useDeleteMessage } from './message-mutations.js';
import { useSelectionStore } from './selection-store.js';

/**
 * Подтверждение удаления (A5, #87; вердикт владельца 24.09 — «диалог с
 * объяснением», undo-снекбар не в v1). Правило следа (#41): не прочитали —
 * исчезнет бесследно; прочитали — останется «Сообщение удалено». Прогноз
 * исхода клиент показывает ПО действия (по readAt из кэша; истину решает
 * сервер — ответ мутации реконсилирует кэш). Пакет — всегда диалог со
 * счётчиком; футер без разделителя (канон 24.09).
 */
export function DeleteDialogHost() {
  const request = useDeleteDialog((s) => s.request);
  const close = useDeleteDialog((s) => s.close);
  // Мутации без аргумента-замыкания: conversationId передаётся В ПЕРЕМЕННЫХ
  // (диалог закрывается сразу после mutate — замыкание опустело бы, гонка).
  const single = useDeleteMessage();
  const batch = useBatchDeleteMessages();
  const queryClient = useQueryClient();

  const cached = useMemo(() => {
    if (!request) return [] as ChatMessage[];
    const caches = queryClient.getQueriesData<Paginated<ChatMessage>>({
      queryKey: chatKeys.messages(request.conversationId),
    });
    const found: ChatMessage[] = [];
    for (const id of request.messageIds) {
      for (const [, data] of caches) {
        const message = data?.items.find((m) => m.id === id);
        if (message) {
          found.push(message);
          break;
        }
      }
    }
    return found;
  }, [request, queryClient]);

  const count = request?.messageIds.length ?? 0;
  const isSingle = count === 1;
  const traced = isSingle ? (cached[0]?.readAt ?? null) !== null : false;
  const description = isSingle
    ? traced
      ? ui.chat.deleteTraced
      : ui.chat.deleteNoTrace
    : ui.chat.deleteManyHint;
  const title = isSingle
    ? ui.chat.deleteTitle
    : `${ui.chat.deleteConfirm} ${count} ${plural(count, [
        ui.chat.messageOne,
        ui.chat.messageFew,
        ui.chat.messageMany,
      ])}?`;

  function confirm() {
    if (!request) return;
    if (isSingle && request.messageIds[0]) {
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
