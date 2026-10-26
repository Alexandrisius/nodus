/** Клавиатура конвейера «Новые» (#55, U4) — чистые функции под тест. */

export type PipelineKeyAction = 'prev' | 'next' | 'register' | 'spam';

export interface PipelineKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Alt+↑/↓ — соседнее письмо, Ctrl/⌘+Enter — «Зарегистрировать», Shift+Delete
 *  — «Удалить как спам», но только вне поля ввода: в тексте Shift+Delete —
 *  «вырезать» Windows, перехватывать его нельзя. */
export function pipelineKeyAction(
  event: PipelineKey,
  inEditable: boolean,
): PipelineKeyAction | null {
  if (event.altKey && !event.ctrlKey && event.key === 'ArrowUp') return 'prev';
  if (event.altKey && !event.ctrlKey && event.key === 'ArrowDown') return 'next';
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') return 'register';
  if (event.shiftKey && event.key === 'Delete' && !inEditable) return 'spam';
  return null;
}

/** Цель элемента — поле ввода (текст, комбобокс, contenteditable). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/** Соседнее письмо по направлению (на краю — остаёмся). */
export function neighbourId(
  ids: readonly string[],
  currentId: string | null,
  direction: -1 | 1,
): string | null {
  if (ids.length === 0) return null;
  const index = currentId ? ids.indexOf(currentId) : -1;
  if (index === -1) return ids[0] ?? null;
  return ids[Math.min(ids.length - 1, Math.max(0, index + direction))] ?? null;
}

/** Куда идти после регистрации/закрытия/удаления: следующее письмо ниже,
 *  на последнем — предыдущее, очередь пуста — null. */
export function nextAfterRemoval(ids: readonly string[], removedId: string): string | null {
  const index = ids.indexOf(removedId);
  if (index === -1) return ids[0] ?? null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
