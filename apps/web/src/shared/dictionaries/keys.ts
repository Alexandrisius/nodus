/** Фабрика ключей справочников (канон patterns.md: ключи только фабрикой).
 *  События `dictionary.*` инвалидируют префикс `all` — подписи вариантов
 *  обновляются во всех полях с этим списком (#431, Р10). */
export const dictionariesKeys = {
  all: ['dictionaries'] as const,
  list: () => [...dictionariesKeys.all, 'list'] as const,
  items: (code: string, includeArchived: boolean) =>
    [...dictionariesKeys.all, 'items', code, includeArchived] as const,
};
