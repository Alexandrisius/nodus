/**
 * Локальные поиск и фильтры списков (строка инструментов журнала/вкладки) —
 * типы и чистая фильтрация. Модель Битрикс24: поиск по списку + фильтр по
 * атрибутам + сохранённые фильтры. Реестр фильтруемых полей на сущность —
 * рядом с реестром колонок (единый стандарт списков, «модули не отличаются»).
 *
 * На моках фильтрация клиентская; формат задела под сервер — query-параметры
 * (`?q=`, `?filter[<поле>]=`) фиксируются в api-conventions (I2, API-first).
 */

/** Значение фильтра: строка (select/person/text) или диапазон дат ISO. */
export type DateRangeValue = { from?: string; to?: string };
export type FilterValue = string | DateRangeValue | undefined;
export type FilterState = Record<string, FilterValue>;

export interface FilterOption {
  value: string;
  label: string;
}

export type FilterFieldType = 'select' | 'person' | 'dateRange' | 'text';

/** Поле фильтра сущности: контрол + чистый предикат совпадения. */
export interface FilterFieldDef<T> {
  id: string;
  label: string;
  type: FilterFieldType;
  /** Варианты для select/person (справочники подставляет потребитель). */
  options?: FilterOption[];
  /** Плейсхолдер для text. */
  placeholder?: string;
  /** Совпадение элемента со значением фильтра (unit-тестируется). */
  match: (item: T, value: FilterValue) => boolean;
}

/** Фильтр «активен» (влияет на список и считается в бейдже/чипах). */
export function isActiveFilter(value: FilterValue): boolean {
  if (value === undefined || value === '') return false;
  if (typeof value === 'object') return Boolean(value.from || value.to);
  return true;
}

/** Человекочитаемое значение активного фильтра — для чипа в строке. */
export function filterValueLabel<T>(def: FilterFieldDef<T>, value: FilterValue): string {
  if (value === undefined) return '';
  if (typeof value === 'object') {
    const from = value.from ?? '…';
    const to = value.to ?? '…';
    return `${from} — ${to}`;
  }
  return def.options?.find((o) => o.value === value)?.label ?? value;
}

/** Универсальная фильтрация: подстрока запроса (без регистра) по searchText +
 *  все активные поля по их match. Пустой запрос/нет полей — исходный список. */
export function applyListFilters<T>(
  items: readonly T[],
  defs: readonly FilterFieldDef<T>[],
  state: FilterState,
  query: string,
  searchText?: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  const active = defs.filter((d) => isActiveFilter(state[d.id]));
  if (!q && active.length === 0) return [...items];
  return items.filter((item) => {
    if (q && searchText && !searchText(item).toLowerCase().includes(q)) return false;
    return active.every((d) => d.match(item, state[d.id]));
  });
}

/** Число активных фильтров (бейдж на кнопке «Фильтр»). */
export function activeFiltersCount<T>(
  defs: readonly FilterFieldDef<T>[],
  state: FilterState,
): number {
  return defs.filter((d) => isActiveFilter(state[d.id])).length;
}

/** Связка «активный фильтр списка» — проп в списки/канбаны потребителей. */
export interface ActiveListFilter<T> {
  defs: readonly FilterFieldDef<T>[];
  state: FilterState;
  query: string;
  searchText?: (item: T) => string;
}

/** Фильтрация реально влияет (запрос непуст или есть активные поля) —
 *  для режимов «n из m» и отключения DnD в канбане. */
export function isFilteringActive<T>(filter: ActiveListFilter<T> | undefined): boolean {
  if (!filter) return false;
  return filter.query.trim() !== '' || activeFiltersCount(filter.defs, filter.state) > 0;
}
