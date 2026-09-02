import { authHandlers } from '../../features/auth/api/mocks/auth-handlers.js';
import { chatHandlers } from '../../features/chat/api/mocks/chat-handlers.js';
import { lettersHandlers } from '../../features/correspondence/api/mocks/letters-handlers.js';
import { directoryHandlers } from '../../features/directory/api/mocks/directory-handlers.js';
import { homeHandlers } from '../../features/home/api/mocks/home-handlers.js';
import { projectsHandlers } from '../../features/projects/api/mocks/projects-handlers.js';
import { tasksHandlers } from '../../features/tasks/api/mocks/tasks-handlers.js';

// Агрегат MSW-хендлеров: хендлеры фич — в features/<name>/api/mocks (patterns.md).
export const handlers = [
  ...authHandlers,
  ...directoryHandlers,
  ...tasksHandlers,
  ...lettersHandlers,
  ...projectsHandlers,
  ...chatHandlers,
  ...homeHandlers,
];
