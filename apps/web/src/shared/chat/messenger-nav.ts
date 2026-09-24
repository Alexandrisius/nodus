/**
 * Отложенный тред для подмены мессенджер-карточки (вердикт 25.09, п.4):
 * замена содержимого верхней карточки `messenger:<id>` идёт через стек
 * (`?cards=`), который несёт только id беседы. Если переход должен открыть
 * ещё и тред (клик по пересланному из треда канала), тред «пристаивается»
 * здесь — MessengerEntry потребляет его синхронно в момент подмены id.
 * Модуль-level состояние: потребление одноразовое, реагировать не нужно.
 */

interface StagedThread {
  conversationId: string;
  threadRootId: string | null;
}

let staged: StagedThread | null = null;

export function stageMessengerThread(conversationId: string, threadRootId: string | null): void {
  staged = { conversationId, threadRootId };
}

/** Тред для беседы, если он пристоен к ней; забирает порцию (одноразово). */
export function takeMessengerThread(conversationId: string): string | null {
  if (!staged || staged.conversationId !== conversationId) return null;
  const threadRootId = staged.threadRootId;
  staged = null;
  return threadRootId;
}
