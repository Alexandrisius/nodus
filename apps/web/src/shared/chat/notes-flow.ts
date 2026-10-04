import type { ChatMessage, FavoriteCard } from '@nodus/contracts';

/**
 * Витрина «Избранного» (#171): плоский единый поток — свои записи (сообщения
 * беседы с собой) + карточки избранного в порядке добавления. Чистая логика
 * слияния/фильтрации (unit-тесты); время записи — createdAt, карточки —
 * favoritedAt (момент закладки): ось одна, поток детерминирован.
 */

export type NotesEntry =
  { kind: 'note'; message: ChatMessage } | { kind: 'favorite'; card: FavoriteCard };

/** Режим потока: все / только записи / только карточки избранного. */
export type NotesFilter = 'all' | 'notes' | 'favorites';

/** Слияние потоков по времени (ASC); при равных метках запись первична
 *  (порядок вставки стабилен — birthday tie-break по kind). */
export function mergeNotesFlow(messages: ChatMessage[], cards: FavoriteCard[]): NotesEntry[] {
  const entries: NotesEntry[] = [
    ...messages.filter((m) => !m.deletedAt).map((message) => ({ kind: 'note', message }) as const),
    ...cards.map((card) => ({ kind: 'favorite', card }) as const),
  ];
  return entries.sort((a, b) => {
    const ta = a.kind === 'note' ? a.message.createdAt : a.card.favoritedAt;
    const tb = b.kind === 'note' ? b.message.createdAt : b.card.favoritedAt;
    if (ta === tb) return a.kind === 'note' ? -1 : 1;
    return ta < tb ? -1 : 1;
  });
}

/** Фильтрация потока: все / Записи / Избранное; поиск — подстрока в тексте
 *  записи или карточки; label — эмодзи-метка карточки (мультивыбор чипов). */
export function filterNotesFlow(
  entries: NotesEntry[],
  filter: NotesFilter,
  q: string | null,
  labels: readonly string[],
): NotesEntry[] {
  const needle = q?.trim().toLowerCase() ?? null;
  const labelSet = new Set(labels);
  return entries.filter((entry) => {
    if (filter === 'notes' && entry.kind !== 'note') return false;
    if (filter === 'favorites' && entry.kind !== 'favorite') return false;
    if (labelSet.size > 0) {
      if (entry.kind !== 'favorite') return false;
      if (!entry.card.labels.some((label) => labelSet.has(label))) return false;
    }
    if (needle) {
      const haystack = entry.kind === 'note' ? entry.message.text : entry.card.text;
      if (!haystack.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

/** Пакетное удаление выделения витрины (#215): запись беседы удаляется как
 *  сообщение, карточка избранного — снимается с избранного (оригинал не
 *  трогается). Разделение — по принадлежности сообщениям беседы «Избранного»
 *  (запись со звездой остаётся ЗАПИСЬЮ: удаляется целиком, закладку чистит
 *  сервер). favoriteMessageIds (множество messageId карточек из кэша
 *  избранного) делает классификацию устойчивой к протухшему кэшу ленты:
 *  id без следа в ОБОИХ множествах консервативно считается записью —
 *  сервер перепроверит автора/беседу и чужое молча пропустит (как в обычных
 *  чатах). Порядок внутри групп сохраняется. */
export function splitNotesSelection(
  ids: readonly string[],
  notesMessageIds: ReadonlySet<string>,
  favoriteMessageIds?: ReadonlySet<string>,
): { noteIds: string[]; cardIds: string[] } {
  const noteIds: string[] = [];
  const cardIds: string[] = [];
  for (const id of ids) {
    if (notesMessageIds.has(id)) noteIds.push(id);
    else if (favoriteMessageIds && !favoriteMessageIds.has(id)) noteIds.push(id);
    else cardIds.push(id);
  }
  return { noteIds, cardIds };
}
