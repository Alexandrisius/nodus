/** Параметры страницы реестра контрагентов (ключ кэша = параметры запроса). */
export interface CounterpartyPageParams {
  /** Серверный поиск по названию/УНП; пусто — без фильтра. */
  search?: string;
  includeArchived: boolean;
}

/** Фабрика ключей справочника контрагентов (канон patterns.md: строки ключей
 *  руками не пишутся). Потребители — фича CRM и корреспонденция (combobox). */
export const counterpartiesKeys = {
  all: ['counterparties'] as const,
  pages: (params: CounterpartyPageParams) => [...counterpartiesKeys.all, 'pages', params] as const,
  /** Подсказки combobox (одна страница на запрос). */
  options: (search: string) => [...counterpartiesKeys.all, 'options', search] as const,
  similar: (input: { name: string; unp: string }) =>
    [...counterpartiesKeys.all, 'similar', input] as const,
  detail: (id: string) => [...counterpartiesKeys.all, 'detail', id] as const,
};
