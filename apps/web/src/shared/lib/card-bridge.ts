/** Ссылка на карточку сущности (структурно совместима с CardRef каркаса). */
export interface CardBridgeRef {
  kind: string;
  id: string;
}

/**
 * Мост к стеку карточек из shared-слоя (порт-адаптер, I13; аудит #45:
 * shared/chat/message-menu импортировал app/shell/use-card-stack — обратная
 * течь слоёв app → features → shared). Shared НЕ знает каркас: порт
 * объявлен здесь, реализацию регистрирует app-shell при старте
 * (registerCardBridge в AppShell). До регистрации — no-op (юнит-тесты
 * shared без каркаса).
 */
let opener: ((ref: CardBridgeRef) => void) | null = null;

export function registerCardBridge(fn: (ref: CardBridgeRef) => void): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openCardViaBridge(ref: CardBridgeRef): void {
  opener?.(ref);
}
