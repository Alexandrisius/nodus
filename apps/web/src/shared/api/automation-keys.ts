/** Ключи кэша «Автоматизации» (#378): библиотека типов задач (архив —
 *  параметром). Живут в shared: потребители — фича automation и
 *  WS-инвалидация каталожных событий (shared → features запрещён). */
export const automationKeys = {
  all: ['automation'] as const,
  types: (archived?: 'include' | 'only') =>
    [...automationKeys.all, 'types', archived ?? 'exclude'] as const,
};
