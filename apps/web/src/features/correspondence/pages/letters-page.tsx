import { useSearch } from '@tanstack/react-router';

import { ModuleAccessMatrix } from '../../../shared/access/module-access-matrix.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { LettersTable } from '../components/letters-table.js';
import { NewLettersPipeline } from '../components/pipeline/new-letters-pipeline.js';
import { resolveLettersTab } from '../lib/letters-tab.js';

const noPermissions: readonly string[] = [];

/**
 * Корреспонденция (#55, ADR-0027) — вкладки топбара `/letters?tab=…`:
 * «Новые» — конвейер регистрации канцелярии (только держателю
 * `correspondence.register`), «Входящие» / «Исходящие» — журналы
 * зарегистрированных, «Права доступа» — матрица раздела. Вкладку решает
 * `resolveLettersTab` — та же функция подсвечивает её в топбаре.
 * Журналы смонтированы по ключу вкладки: память поиска, фильтров и
 * прокрутки у каждой своя, строки соседней вкладки не мелькают.
 */
export function LettersPage() {
  const search = useSearch({ strict: false }) as { tab?: unknown };
  const permissions = useAuthStore((s) => s.user?.permissions) ?? noPermissions;
  const tab = resolveLettersTab(search, permissions);
  if (tab === 'access') return <ModuleAccessMatrix module="correspondence" />;
  if (tab === 'new') return <NewLettersPipeline />;
  return <LettersTable key={tab} box={tab} />;
}
