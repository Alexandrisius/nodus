/**
 * Персональный цвет имени автора (#180, вердикт владельца 01.10; модель
 * Telegram/Битрикс24/Slack): детерминированный тон палитры `--name-1..7`
 * по UUID автора — у человека всегда один цвет в любом хосте (пузырь чата,
 * карточка поста канала, надгробие). Палитра текстопригодна в обеих темах
 * (AA на пузырях), тон — МАРКЕР ИДЕНТИЧНОСТИ человека (канон «цвет = смысл»),
 * не декор: при 170 сотрудниках повторы неизбежны, цвет — подсказка, не
 * идентификатор. Ключ — id (стабилен), не имя (меняется/коллизует).
 *
 * Классы статичны списком: Tailwind не собирает динамические строки.
 */

export const personToneClasses = [
  'text-name-1',
  'text-name-2',
  'text-name-3',
  'text-name-4',
  'text-name-5',
  'text-name-6',
  'text-name-7',
] as const;

/** CSS-переменные тонов той же палитры — для фонов/линий (не-текстовое
 *  использование: тинт цитаты-реплая #187 п.8, левая линия — color-mix). */
export const personToneVars = [
  'var(--name-1)',
  'var(--name-2)',
  'var(--name-3)',
  'var(--name-4)',
  'var(--name-5)',
  'var(--name-6)',
  'var(--name-7)',
] as const;

/** FNV-1a: короткий детерминированный хеш без зависимостей. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Тон имени автора: класс text-name-* из палитры своей темы. */
export function personTone(authorId: string): string {
  return personToneClasses[hashId(authorId) % personToneClasses.length] ?? 'text-name-1';
}

/** Тон автора CSS-переменной (var(--name-N)) — фоны/линии в цвете человека. */
export function personToneVar(authorId: string): string {
  return personToneVars[hashId(authorId) % personToneVars.length] ?? 'var(--name-1)';
}
