/**
 * Вкладки правой панели карточки письма (#55, U7): «Тело» и «Чат» —
 * неснимаемые, вложения — закрываемые, не больше `MAX_FILE_TABS`; седьмое
 * вложение закрывает самую давнюю неактивную вкладку файла. Вкладки
 * монтируются при первом показе и дальше живут скрытыми (`visited`):
 * позиция и масштаб документа не теряются. Чистые функции — тестируются
 * без DOM.
 */

export type LetterTabId = 'body' | 'chat' | `file:${string}`;

export const MAX_FILE_TABS = 6;

export interface LetterTabsState {
  /** id вложений открытых вкладок — в порядке открытия (порядок на полосе). */
  files: string[];
  active: LetterTabId;
  /** Хоть раз показанные вкладки — их содержимое смонтировано. */
  visited: LetterTabId[];
  /** Момент последней активации вкладки файла (счётчик) — для вытеснения. */
  usedAt: Record<string, number>;
  tick: number;
}

export const fileTabId = (attachmentId: string): LetterTabId => `file:${attachmentId}`;

export function fileIdOf(tab: LetterTabId): string | null {
  return tab.startsWith('file:') ? tab.slice(5) : null;
}

export function initialTabs(active: LetterTabId): LetterTabsState {
  return { files: [], active, visited: [active], usedAt: {}, tick: 0 };
}

export function activateTab(state: LetterTabsState, tab: LetterTabId): LetterTabsState {
  const fileId = fileIdOf(tab);
  if (fileId !== null && !state.files.includes(fileId)) return state;
  const tick = state.tick + 1;
  return {
    ...state,
    active: tab,
    visited: state.visited.includes(tab) ? state.visited : [...state.visited, tab],
    usedAt: fileId === null ? state.usedAt : { ...state.usedAt, [fileId]: tick },
    tick,
  };
}

/** Открыть вложение вкладкой (или перейти к уже открытой). */
export function openFileTab(state: LetterTabsState, attachmentId: string): LetterTabsState {
  if (state.files.includes(attachmentId)) return activateTab(state, fileTabId(attachmentId));
  let next = state;
  if (state.files.length >= MAX_FILE_TABS) {
    const activeFile = fileIdOf(state.active);
    const evicted = state.files
      .filter((id) => id !== activeFile)
      .reduce<string | null>(
        (oldest, id) =>
          oldest === null || (state.usedAt[id] ?? 0) < (state.usedAt[oldest] ?? 0) ? id : oldest,
        null,
      );
    if (evicted !== null) next = dropFile(state, evicted);
  }
  return activateTab({ ...next, files: [...next.files, attachmentId] }, fileTabId(attachmentId));
}

/** Закрыть вкладку файла; активная уходит к соседу слева (или справа),
 *  без соседей — к «Телу». */
export function closeFileTab(state: LetterTabsState, attachmentId: string): LetterTabsState {
  const index = state.files.indexOf(attachmentId);
  if (index < 0) return state;
  const next = dropFile(state, attachmentId);
  if (state.active !== fileTabId(attachmentId)) return next;
  const neighbour = next.files[index - 1] ?? next.files[index];
  return activateTab(next, neighbour ? fileTabId(neighbour) : 'body');
}

function dropFile(state: LetterTabsState, attachmentId: string): LetterTabsState {
  const tab = fileTabId(attachmentId);
  const usedAt = { ...state.usedAt };
  delete usedAt[attachmentId];
  return {
    ...state,
    files: state.files.filter((id) => id !== attachmentId),
    visited: state.visited.filter((visited) => visited !== tab),
    usedAt,
  };
}

/** Вкладки, чьи вложения пропали из письма (правка состава), — закрыть. */
export function pruneFileTabs(
  state: LetterTabsState,
  attachmentIds: readonly string[],
): LetterTabsState {
  return state.files
    .filter((id) => !attachmentIds.includes(id))
    .reduce((acc, id) => closeFileTab(acc, id), state);
}
