import { useEffect, useRef } from 'react';

import { focusConversationComposerWhenFree } from './composer-focus.js';
import { DeleteDialogHost } from './delete-dialog.js';
import { useDeleteDialog, useForwardDialog, useUnpinDialog } from './dialog-stores.js';
import { ForwardDialogHost } from './forward-dialog.js';
import { SelectionQuoteBubble } from './selection-quote-bubble.js';
import { UnpinDialogHost } from './unpin-dialog.js';

/**
 * Единая точка монтирования глобальных диалогов чата (#87): пересылка и
 * подтверждение удаления живут в app-shell рядом с Toaster — инициаторы
 * (контекстное меню сообщения, полоса селекта в любом хосте) кладут запрос
 * в dialog-stores, диалог один на приложение (портал, z-порядок — канон
 * оверлеев z-[70]). Баббл-цитата выделения — тоже один на приложение
 * (слушает document, портал в body поверх оверлеев).
 */
export function ChatDialogHosts() {
  useComposerRestoreAfterDialogs();
  return (
    <>
      <ForwardDialogHost />
      <DeleteDialogHost />
      <UnpinDialogHost />
      <SelectionQuoteBubble />
    </>
  );
}

/** «Вечный курсор» после глобальных диалогов (баг #91): пересылка/удаление/
 *  откреп гасили мигающий курсор композера — Radix возвращает фокус триггеру
 *  контекстного меню, которого к моменту закрытия уже нет в DOM. Закрытие
 *  любого из трёх диалогов возвращает курсор в композер беседы-источника,
 *  дождавшись освобождения оверлей-слоёв (канон #71: не красть фокус у
 *  открытого слоя — следующий диалог поверх переживёт переход безболезненно). */
function useComposerRestoreAfterDialogs() {
  const forward = useForwardDialog((s) => s.request);
  const remove = useDeleteDialog((s) => s.request);
  const unpin = useUnpinDialog((s) => s.request);
  const lastSource = useRef<string | null>(null);
  const source =
    forward?.sourceConversationId ?? remove?.conversationId ?? unpin?.conversationId ?? null;
  useEffect(() => {
    if (source) {
      lastSource.current = source;
      return;
    }
    if (lastSource.current) {
      focusConversationComposerWhenFree(lastSource.current);
      lastSource.current = null;
    }
  }, [source]);
}
