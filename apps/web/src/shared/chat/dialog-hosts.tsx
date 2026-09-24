import { DeleteDialogHost } from './delete-dialog.js';
import { ForwardDialogHost } from './forward-dialog.js';
import { SelectionQuoteBubble } from './selection-quote-bubble.js';

/**
 * Единая точка монтирования глобальных диалогов чата (#87): пересылка и
 * подтверждение удаления живут в app-shell рядом с Toaster — инициаторы
 * (контекстное меню сообщения, полоса селекта в любом хосте) кладут запрос
 * в dialog-stores, диалог один на приложение (портал, z-порядок — канон
 * оверлеев z-[70]). Баббл-цитата выделения — тоже один на приложение
 * (слушает document, портал в body поверх оверлеев).
 */
export function ChatDialogHosts() {
  return (
    <>
      <ForwardDialogHost />
      <DeleteDialogHost />
      <SelectionQuoteBubble />
    </>
  );
}
