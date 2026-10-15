/**
 * Отложенный тред для подмены мессенджер-карточки (вердикт 25.09, п.4):
 * замена содержимого верхней карточки `messenger:<id>` идёт через стек
 * (`?cards=`), который несёт только id беседы. Если переход должен открыть
 * ещё и тред (клик по пересланному из треда канала, клик по уведомлению о
 * трэде — #300), тред «пристаивается» здесь — живая карточка потребляет его
 * по подписке, новая — на маунте, подмена id — синхронно в рендере.
 * Модуль-level состояние: потребление одноразовое.
 */

interface StagedThread {
  conversationId: string;
  threadRootId: string | null;
}

let staged: StagedThread | null = null;
const listeners = new Set<() => void>();

export function stageMessengerThread(conversationId: string, threadRootId: string | null): void {
  staged = { conversationId, threadRootId };
  for (const fn of listeners) fn();
}

/** Тред для беседы, если он пристоен к ней; забирает порцию (одноразово). */
export function takeMessengerThread(conversationId: string): string | null {
  if (!staged || staged.conversationId !== conversationId) return null;
  const threadRootId = staged.threadRootId;
  staged = null;
  return threadRootId;
}

/**
 * Подписка на пристойку треда (#300): живая карточка мессенджера открывает
 * тред сразу — включая случай «клик по уведомлению, когда карточка той же
 * беседы уже верхняя» (openCard на той же карточке — no-op, без подписки
 * тред зависал бы непотреблённым).
 */
export function subscribeMessengerThread(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
