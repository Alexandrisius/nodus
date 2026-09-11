import { useCallback, useMemo, useState } from 'react';

import { applyListFilters, type ActiveListFilter, type FilterState } from './list-filters.js';

/** Сохранённый фильтр (пресет Битрикс24): имя + состояние полей; «скрепка»
 *  (pinned) — применяется по умолчанию при открытии списка. */
export interface FilterPreset {
  id: string;
  name: string;
  state: FilterState;
  pinned: boolean;
}

interface StoredView {
  filters: FilterState;
  presets: FilterPreset[];
}

const STORAGE_PREFIX = 'nodus-list-filters-v1:';

function load(viewKey: string): StoredView {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + viewKey);
    if (!raw) return { filters: {}, presets: [] };
    const parsed = JSON.parse(raw) as Partial<StoredView>;
    return {
      filters: parsed.filters ?? {},
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
    };
  } catch {
    return { filters: {}, presets: [] };
  }
}

function save(viewKey: string, value: StoredView) {
  try {
    localStorage.setItem(STORAGE_PREFIX + viewKey, JSON.stringify(value));
  } catch {
    // приватный режим / квота — фильтры просто не запомнятся
  }
}

/** Состояние локального поиска и фильтров списка (память между сессиями, как
 *  ширины колонок и отображаемые поля). Запрос (поиск) — не персистится:
 *  эфемерен по смыслу. При открытии списка, если есть закреплённый пресет —
 *  применяется он («скрепка по умолчанию»), иначе — последние фильтры. */
export function useListToolbar(viewKey: string) {
  const [stored, setStored] = useState<StoredView>(() => {
    const initial = load(viewKey);
    const pinned = initial.presets.find((p) => p.pinned);
    return pinned ? { ...initial, filters: pinned.state } : initial;
  });
  const [query, setQuery] = useState('');

  const update = useCallback(
    (next: StoredView) => {
      setStored(next);
      save(viewKey, next);
    },
    [viewKey],
  );

  const setFilter = useCallback(
    (id: string, value: FilterState[string]) => {
      const filters = { ...stored.filters };
      if (
        value === undefined ||
        value === '' ||
        (typeof value === 'object' && !value.from && !value.to)
      ) {
        delete filters[id];
      } else {
        filters[id] = value;
      }
      update({ ...stored, filters });
    },
    [stored, update],
  );

  const resetAll = useCallback(() => update({ ...stored, filters: {} }), [stored, update]);

  const savePreset = useCallback(
    (name: string) => {
      const preset: FilterPreset = {
        id: crypto.randomUUID(),
        name,
        state: stored.filters,
        pinned: false,
      };
      update({ ...stored, presets: [...stored.presets, preset] });
    },
    [stored, update],
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = stored.presets.find((p) => p.id === id);
      if (preset) update({ ...stored, filters: preset.state });
    },
    [stored, update],
  );

  const deletePreset = useCallback(
    (id: string) => {
      update({ ...stored, presets: stored.presets.filter((p) => p.id !== id) });
    },
    [stored, update],
  );

  /** «Скрепка»: единственный закреплённый пресет; повторный клик — открепить. */
  const togglePin = useCallback(
    (id: string) => {
      update({
        ...stored,
        presets: stored.presets.map((p) => ({ ...p, pinned: p.id === id ? !p.pinned : false })),
      });
    },
    [stored, update],
  );

  return useMemo(
    () => ({
      query,
      setQuery,
      filters: stored.filters,
      setFilter,
      resetAll,
      presets: stored.presets,
      savePreset,
      applyPreset,
      deletePreset,
      togglePin,
    }),
    [
      query,
      stored.filters,
      setFilter,
      resetAll,
      stored.presets,
      savePreset,
      applyPreset,
      deletePreset,
      togglePin,
    ],
  );
}

export type ListToolbarState = ReturnType<typeof useListToolbar>;

/** Отфильтрованный список потребителя (memo): без фильтра — копия исходного. */
export function useFilteredList<T>(items: readonly T[], filter?: ActiveListFilter<T>): T[] {
  return useMemo(
    () =>
      filter
        ? applyListFilters(items, filter.defs, filter.state, filter.query, filter.searchText)
        : [...items],
    [items, filter],
  );
}
