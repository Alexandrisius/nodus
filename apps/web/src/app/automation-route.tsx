import { useSearch } from '@tanstack/react-router';

import { AutomationPage } from '../features/automation/pages/automation-page.js';
import { ProjectTypesPage } from '../features/projects/pages/project-types-page.js';

/**
 * Раздел «Автоматизация» — композиция фич на уровне app (cross-feature
 * импорт запрещён, I6): вкладка «Типы проектов» (#52) живёт в фиче
 * projects, остальные вкладки — в automation. Роутер отдаёт один раздел.
 */
export function AutomationRoute() {
  const search = useSearch({ strict: false }) as { tab?: string };
  return search.tab === 'project-types' ? <ProjectTypesPage /> : <AutomationPage />;
}
