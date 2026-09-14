/**
 * Стек карточек сущностей (ADR-0009) — типы и (де)сериализация URL.
 *
 * КАНОН: все карточки сущностей (задача, проект, письмо, сотрудник, беседа) —
 * ОДНОЙ геометрии (единый SliderPanel без уровней) и наслаиваются друг на
 * друга: открытие из карточки кладёт новую ПОВЕРХ, закрытие верхней
 * возвращает к предыдущей (та живая, состояние сохранено). Стек отражён в
 * search-параметре `?cards=task:<id>,project:<id>` — deep-link, восстановление
 * после F5, «назад» браузера = снять верхнюю карточку. Беседа — тоже
 * сущность (вердикт владельца 14.09.2026: «уточнить в чате, не закрывая
 * карточку задачи»): вид `chat:<conversationId>`.
 */

export type CardKind = 'task' | 'project' | 'letter' | 'employee' | 'chat';

export interface CardRef {
  kind: CardKind;
  id: string;
}

const KINDS: readonly string[] = ['task', 'project', 'letter', 'employee', 'chat'];

/** «task:<id>» — компактная форма в URL. */
export function cardRefToString(ref: CardRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function cardRefFromString(raw: string): CardRef | null {
  const sep = raw.indexOf(':');
  if (sep <= 0) return null;
  const kind = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!KINDS.includes(kind) || id.length === 0) return null;
  return { kind: kind as CardKind, id };
}

/** Стек из search-параметра (строка «task:id,project:id»); мусор отбрасывается. */
export function parseCardStack(raw: unknown): CardRef[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw
    .split(',')
    .map(cardRefFromString)
    .filter((ref): ref is CardRef => ref !== null);
}

/** Сериализация стека; пустой стек → undefined (параметр исчезает из URL). */
export function serializeCardStack(cards: readonly CardRef[]): string | undefined {
  return cards.length > 0 ? cards.map(cardRefToString).join(',') : undefined;
}

export function sameCard(a: CardRef, b: CardRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}
