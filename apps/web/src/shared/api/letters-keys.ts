/** Ключи кэша корреспонденции — CANONICAL в shared (образец: tasks-keys.ts):
 *  потребители — фича корреспонденции и мутации задач (закрытие поручения
 *  меняет статус документа — карточка письма инвалидируется из tasks-api,
 *  без cross-feature импорта, I6). Строки ключей руками не пишутся
 *  (patterns.md) — только эта фабрика. */
export const lettersKeys = {
  all: ['letters'] as const,
  list: (folder: string) => [...lettersKeys.all, 'list', folder] as const,
  detail: (id: string) => [...lettersKeys.all, 'detail', id] as const,
};
