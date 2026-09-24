import type { HttpHandler } from 'msw';

import { authHandlers } from '../features/auth/api/mocks/auth-handlers.js';
import { chatHandlers } from '../features/chat/api/mocks/chat-handlers.js';
import { lettersHandlers } from '../features/correspondence/api/mocks/letters-handlers.js';
import { counterpartiesHandlers } from '../features/crm/api/mocks/counterparties-handlers.js';
import { directoryHandlers } from '../features/directory/api/mocks/directory-handlers.js';
import { homeHandlers } from '../features/home/api/mocks/home-handlers.js';
import { projectsHandlers } from '../features/projects/api/mocks/projects-handlers.js';
import { tasksHandlers } from '../features/tasks/api/mocks/tasks-handlers.js';
import { API_MOCK_DOMAINS, type ApiMockDomain } from '../shared/api/api-mock-config.js';

/**
 * Агрегат MSW-хендлеров по доменам (#48): хендлеры фич живут в
 * features/<name>/api/mocks (patterns.md, файлы не переносятся), здесь —
 * только карта домен → хендлеры. Record по ApiMockDomain: новый домен в
 * API_MOCK_DOMAINS без хендлеров не скомпилируется.
 */
const domainHandlers: Record<ApiMockDomain, HttpHandler[]> = {
  auth: authHandlers,
  directory: directoryHandlers,
  tasks: tasksHandlers,
  letters: lettersHandlers,
  counterparties: counterpartiesHandlers,
  projects: projectsHandlers,
  chat: chatHandlers,
  home: homeHandlers,
};

/** Хендлеры мокаемых доменов (#48): 'all' — все (демо-сборка nodus.by),
 *  иначе — только домены из списка VITE_API_MOCK (живой логин + моки
 *  остальных). Порядок сохраняет специфичность маршрутов MSW. */
export function buildMockHandlers(domains: ReadonlySet<ApiMockDomain> | 'all'): HttpHandler[] {
  const mocked =
    domains === 'all' ? API_MOCK_DOMAINS : API_MOCK_DOMAINS.filter((d) => domains.has(d));
  return mocked.flatMap((domain) => domainHandlers[domain]);
}
