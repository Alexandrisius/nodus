import type { LetterDirection, LetterHistoryEntry } from '@nodus/contracts';

import { seedHistory } from './letter-history-seed.js';
import { seedLetters } from './letter-seed.js';
import type { DemoLetter } from './letters-model.js';

export { lid } from './letter-ids.js';
export * from './letters-model.js';

/** Состояние мок-сервера писем (#55): письма, журнал и счётчики серий —
 *  в памяти страницы (перезагрузка возвращает демо-мир, gotcha msw-query).
 *  Общий стор доменов letters, chat (беседа письма), crm (счётчик писем). */

export const demoLetters: DemoLetter[] = seedLetters();

export const letterHistory: Map<string, LetterHistoryEntry[]> = seedHistory(demoLetters);

export function findLetter(id: string): DemoLetter | undefined {
  return demoLetters.find((letter) => letter.id === id);
}

/** Запись журнала письма — новые сверху (как `GET /letters/:id/history`). */
export function pushLetterHistory(letterId: string, entry: LetterHistoryEntry): void {
  const entries = letterHistory.get(letterId) ?? [];
  entries.unshift(entry);
  letterHistory.set(letterId, entries);
}

/** Серии номеров без пропусков и со сбросом по году (Р2): демо-набор
 *  заканчивается Вх-2026/117 — первая регистрация даёт «Вх-2026/118». */
const series: Record<LetterDirection, { prefix: string; year: number; last: number }> = {
  incoming: { prefix: 'Вх', year: 2026, last: 117 },
  outgoing: { prefix: 'Исх', year: 2026, last: 0 },
};

export function nextLetterNumber(direction: LetterDirection, at = new Date()): string {
  const entry = series[direction];
  const year = at.getFullYear();
  if (year !== entry.year) {
    entry.year = year;
    entry.last = 0;
  }
  entry.last += 1;
  return `${entry.prefix}-${year}/${entry.last}`;
}

/** Локальная ISO-дата (часовой пояс компании в моке — браузер). */
export function localIsoDate(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Зарегистрированных писем контрагента — счётчик карточки CRM (проекция). */
export function lettersCountOf(counterpartyId: string): number {
  return demoLetters.filter(
    (letter) => letter.registeredAt !== null && letter.counterparty?.id === counterpartyId,
  ).length;
}
