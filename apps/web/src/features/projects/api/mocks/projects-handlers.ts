import { projectCatalogHandlers } from './project-catalog-handlers.js';
import { projectMutationHandlers } from './project-mutation-handlers.js';
import { projectReadHandlers } from './project-read-handlers.js';

/**
 * Агрегат мок-хендлеров модуля проектов (#52). Порядок важен: справочники
 * (`/projects/types`, `/projects/groups`) — ДО параметрического
 * `/projects/:id` (MSW матчит по порядку массива — gotcha msw-query).
 */
export const projectsHandlers = [
  ...projectCatalogHandlers,
  ...projectReadHandlers,
  ...projectMutationHandlers,
];
