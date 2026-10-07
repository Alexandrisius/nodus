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

/** Идентификатор источника окна «Избранного» (#211 Ф3): беседа-источник
 *  звёзд или псевдоисточник «Записи» (свои сообщения, не звёзды). */
export type NotesSourceId = string | 'notes';

/** Слияние потоков (#243): записи — В ПОРЯДКЕ КЭША ЛЕНТЫ (comparator 0,
 *  стабильная сортировка сохраняет порядок массива — очередь отправки
 *  держит его «порядок кликов навсегда»), карточки — по favoritedAt,
 *  запись↔карточка сплетаются по времени (createdAt vs favoritedAt; при
 *  равенстве запись первична). Сортировать записи по createdAt НЕЛЬЗЯ:
 *  темп несёт клиентскую метку, серверная запись — серверную, замена
 *  метки при подтверождении переставляла сообщения «пляской» даже на
 *  быстром канале. */
export function mergeNotesFlow(messages: ChatMessage[], cards: FavoriteCard[]): NotesEntry[] {
  const entries: NotesEntry[] = [
    ...messages.filter((m) => !m.deletedAt).map((message) => ({ kind: 'note', message }) as const),
    ...cards.map((card) => ({ kind: 'favorite', card }) as const),
  ];
  const timeOf = (e: NotesEntry) => (e.kind === 'note' ? e.message.createdAt : e.card.favoritedAt);
  return entries.sort((a, b) => {
    if (a.kind === 'note' && b.kind === 'note') return 0; // порядок кэша
    if (a.kind === 'favorite' && b.kind === 'favorite') {
      return timeOf(a) < timeOf(b) ? -1 : timeOf(a) > timeOf(b) ? 1 : 0;
    }
    const ta = timeOf(a);
    const tb = timeOf(b);
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

/** Фильтр окна-источника (#211 Ф3): 'notes' — только СВОИ записи (автор =
 *  владелец «Избранного»), иначе — только звёзды из беседы-источника.
 *  Глубина = глубина витрины (те же данные окна, догрузка ленты — #117). */
export function filterNotesFlowBySource(
  entries: NotesEntry[],
  source: string | 'notes',
  meId: string,
): NotesEntry[] {
  if (source === 'notes') {
    return entries.filter((entry) => entry.kind === 'note' && entry.message.author.id === meId);
  }
  return entries.filter(
    (entry) => entry.kind === 'favorite' && entry.card.conversationId === source,
  );
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
/** Идентификаторы батч-команд селекта витрины (#243, «не сломать витрину»):
 *  карточка — СЕРВЕРНАЯ закладка (её id = id оригинала, валиден для команд,
 *  псевдо-запись несёт seq=0, но это НЕ летящий темп); летящий темп — только
 *  ЗАПИСЬ (собственная отправка в беседу Заметок) с seq=0 — её серверного id
 *  ещё нет. pending = в выделении есть такие записи (команды серые). */
export function notesSelectionIds(
  selected: readonly ChatMessage[],
  feedCardIds: ReadonlySet<string>,
): { ids: string[]; pending: boolean } {
  let pending = false;
  const ids: string[] = [];
  for (const m of selected) {
    if (feedCardIds.has(m.id)) {
      ids.push(m.id);
      continue;
    }
    if (m.seq > 0) ids.push(m.id);
    else pending = true;
  }
  return { ids, pending };
}

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
