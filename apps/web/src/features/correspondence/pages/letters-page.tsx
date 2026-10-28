import { useSearch } from '@tanstack/react-router';

import { ModuleAccessMatrix } from '../../../shared/access/module-access-matrix.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { LettersTable } from '../components/letters-table.js';
import { resolveLettersTab } from '../lib/letters-tab.js';

const noPermissions: readonly string[] = [];

/**
 * Корреспонденция (#55, ADR-0027) — вкладки топбара `/letters?tab=…`:
 * «Новые» — очередь канцелярии списком с карточкой-формой (редизайн #56,
 * право `correspondence.register`), «Входящие» / «Исходящие» — журналы
 * зарегистрированных, «Права доступа» — матрица раздела. Вкладку решает
 * `resolveLettersTab` — та же функция подсвечивает её в топбаре.
 * Вкладки смонтированы по ключу: память поиска, фильтров и прокрутки у
 * каждой своя, строки соседней вкладки не мелькают.
 */
export function LettersPage() {
  const search = useSearch({ strict: false }) as { tab?: unknown };
  const permissions = useAuthStore((s) => s.user?.permissions) ?? noPermissions;
  const tab = resolveLettersTab(search, permissions);
  if (tab === 'access') return <ModuleAccessMatrix module="correspondence" />;
  return <LettersTable key={tab} box={tab} />;
}
