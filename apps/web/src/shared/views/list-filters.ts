/**
 * Локальные поиск и фильтры списков (строка инструментов журнала/вкладки) —
 * типы и чистая фильтрация. Модель Битрикс24: поиск по списку + фильтр по
 * атрибутам + сохранённые фильтры. Реестр фильтруемых полей на сущность —
 * рядом с реестром колонок (единый стандарт списков, «модули не отличаются»).
 *
 * На моках фильтрация клиентская; формат задела под сервер — query-параметры
 * (`?q=`, `?filter[<поле>]=`) фиксируются в api-conventions (I2, API-first).
 */

/** Значение фильтра: строка (select/person/text) или диапазон дат ISO /
 *  чисел (`{ from?, to? }`). */
export type DateRangeValue = { from?: string; to?: string };
export type NumberRangeValue = { from?: number; to?: number };
export type FilterValue = string | DateRangeValue | NumberRangeValue | undefined;
export type FilterState = Record<string, FilterValue>;

export interface FilterOption {
  value: string;
  label: string;
  /** Аватар для person-опций (комбобокс показывает с фото, как в Битриксе). */
  avatarUrl?: string | null;
}

export type FilterFieldType = 'select' | 'person' | 'dateRange' | 'text' | 'numberRange';

/** Поле фильтра сущности: контрол + чистый предикат совпадения. */
export interface FilterFieldDef<T> {
  id: string;
  label: string;
  type: FilterFieldType;
  /** Варианты для select/person (справочники подставляет потребитель). */
  options?: FilterOption[];
  /** Плейсхолдер для text. */
  placeholder?: string;
  /** Заголовок группы в панели фильтра (атрибуты — «Атрибуты», #431). */
  group?: string;
  /** Диапазон чисел в «ч:мм» (продолжительность кастомного поля). */
  numberFormat?: 'duration';
  /** Скрытое поле: в панель не выводится (служебные — пресеты/счётчики),
   *  но участвует в фильтрации и чипах (напр. «Просроченные»). */
  hidden?: boolean;
  /** Совпадение элемента со значением фильтра (unit-тестируется). */
  match: (item: T, value: FilterValue) => boolean;
}

/** Фильтр «активен» (влияет на список и считается в бейдже/чипах). */
export function isActiveFilter(value: FilterValue): boolean {
  if (value === undefined || value === '') return false;
  if (typeof value === 'object') return value.from !== undefined || value.to !== undefined;
  return true;
}

/** Человекочитаемое значение активного фильтра — для чипа в строке. */
export function filterValueLabel<T>(def: FilterFieldDef<T>, value: FilterValue): string {
  if (value === undefined) return '';
  if (typeof value === 'object') {
    if ('from' in value || 'to' in value) {
      const format = (n: number | undefined) =>
        n === undefined ? '…' : def.numberFormat === 'duration' ? formatMinutes(n) : String(n);
      const isNumber = def.type === 'numberRange';
      const from = isNumber ? format(value.from as number | undefined) : (value.from ?? '…');
      const to = isNumber ? format(value.to as number | undefined) : (value.to ?? '…');
      return `${from} — ${to}`;
    }
  }
  return def.options?.find((o) => o.value === value)?.label ?? String(value);
}

/** «ч:мм» для чипов диапазона продолжительности (без зависимости от
 *  custom-fields: фильтры живут в shared/views). */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
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

/** Одинаковые состояния фильтров (для подсветки активного пресета):
 *  сравнение по активным значениям, порядок ключей не важен. */
export function sameFilterState(a: FilterState, b: FilterState): boolean {
  const keysOf = (s: FilterState) => Object.keys(s).filter((k) => isActiveFilter(s[k]));
  const aKeys = keysOf(a);
  const bKeys = keysOf(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => {
    const av = a[k];
    const bv = b[k];
    if (typeof av === 'object' && typeof bv === 'object' && av && bv) {
      return (av.from ?? '') === (bv.from ?? '') && (av.to ?? '') === (bv.to ?? '');
    }
    return av === bv;
  });
}
