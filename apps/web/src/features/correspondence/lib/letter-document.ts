import type { LetterListItem } from '@nodus/contracts';

/** Документное состояние письма (модель v2): у письма статуса нет, он
 *  появляется у документа (registration ≠ null); «просрочено» — ПРОИЗВОДНОЕ
 *  (в работе + срок исполнения раньше сегодня), не значение enum. */
export type DocumentState = 'in_work' | 'overdue' | 'executed' | 'archived';

/** Локальное «сегодня» yyyy-mm-dd — для сравнения с date-полями (дедлайн
 *  регистрации хранится датой без времени, UTC-сдвиг ломал бы день). */
export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Письмо можно зарегистрировать: входящее без регистрации (незарегистрированные —
 *  часть Входящих, отдельной папки нет; пресет секретаря «К регистрации»). */
export function isRegistrable(letter: LetterListItem): boolean {
  return letter.type === 'incoming' && letter.registration === null;
}

export function isLetterOverdue(letter: LetterListItem): boolean {
  const deadline = letter.registration?.deadline;
  return letter.documentStatus === 'in_work' && !!deadline && deadline < todayStr();
}

export function documentStateOf(letter: LetterListItem): DocumentState | null {
  if (!letter.registration || !letter.documentStatus) return null;
  if (letter.documentStatus === 'in_work') {
    return isLetterOverdue(letter) ? 'overdue' : 'in_work';
  }
  return letter.documentStatus;
}
