/** Ключи кэша главной — CANONICAL в shared (образец: tasks-keys/letters-keys):
 *  сводку читает фича home, а инвалидирует корреспонденция (регистрация и
 *  исходящие меняют счётчик очереди «К регистрации» и недавние документы —
 *  без cross-feature импорта, I6). */
export const homeKeys = {
  all: ['home'] as const,
  summary: () => [...homeKeys.all, 'summary'] as const,
};
