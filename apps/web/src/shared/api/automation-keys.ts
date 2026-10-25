import type { ProcessCategory } from '@nodus/contracts';

/** Ключи кэша «Автоматизации» (#378, #428): библиотека типов процессов
 *  (архив и категория — параметрами). Живут в shared: потребители — фича
 *  automation, задачные хуки (типы категории `task`) и WS-инвалидация
 *  каталожных событий (shared → features запрещён). */
export const automationKeys = {
  all: ['automation'] as const,
  types: (archived?: 'exclude' | 'include' | 'only', category?: ProcessCategory) =>
    [...automationKeys.all, 'types', archived ?? 'exclude', category ?? 'all'] as const,
};
