/**
 * Клавиша отправки сообщения (вердикт владельца 14.09.2026: «классика»):
 * Enter — отправить, Shift+Enter и Ctrl+Enter — перенос строки. Чистая
 * функция — детерминированный unit-тест без DOM.
 */
export function isSendShortcut(key: string, shiftKey: boolean, ctrlKey: boolean): boolean {
  return key === 'Enter' && !shiftKey && !ctrlKey;
}
