/** Ключи кэша корреспонденции — CANONICAL в shared (образец: tasks-keys.ts):
 *  потребители — фича корреспонденции и мутации задач (закрытие поручения
 *  меняет статус документа — карточка письма инвалидируется из tasks-api,
 *  без cross-feature импорта, I6). Строки ключей руками не пишутся
 *  (patterns.md) — только эта фабрика. */
export const lettersKeys = {
  all: ['letters'] as const,
  /** Префикс списков папки (инвалидация всех вариантов фильтра контрагента). */
  list: (folder: string) => [...lettersKeys.all, 'list', folder] as const,
  /** Точный ключ списка useLettersList: папка + фильтр контрагента (null —
   *  без фильтра; «Отправленные» без фильтра — целевой кэш оптимистичной
   *  вставки исходящего). */
  folderList: (folder: string, counterpartyId: string | null = null) =>
    [...lettersKeys.list(folder), counterpartyId] as const,
  detail: (id: string) => [...lettersKeys.all, 'detail', id] as const,
  /** Почтовые ящики отправки (справочник формы исходящего). */
  mailboxes: () => [...lettersKeys.all, 'mailboxes'] as const,
};
