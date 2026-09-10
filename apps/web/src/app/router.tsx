import { lazy } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { AppShell } from './shell/app-shell.js';
import { useAuthStore } from '../shared/auth-store.js';

const LoginPage = lazy(() =>
  import('../features/auth/login-page.js').then((m) => ({ default: m.LoginPage })),
);
const HomePage = lazy(() =>
  import('../features/home/pages/home-page.js').then((m) => ({ default: m.HomePage })),
);
const TasksPage = lazy(() =>
  import('../features/tasks/pages/tasks-page.js').then((m) => ({ default: m.TasksPage })),
);
const LettersPage = lazy(() =>
  import('../features/correspondence/pages/letters-page.js').then((m) => ({
    default: m.LettersPage,
  })),
);
const ProjectsPage = lazy(() =>
  import('../features/projects/pages/projects-page.js').then((m) => ({ default: m.ProjectsPage })),
);
const ChatPage = lazy(() =>
  import('../features/chat/pages/chat-page.js').then((m) => ({ default: m.ChatPage })),
);
const EmployeesPage = lazy(() =>
  import('../features/directory/pages/employees-page.js').then((m) => ({
    default: m.EmployeesPage,
  })),
);

/**
 * Роутер SPA (TanStack Router, code-splitting по разделам).
 * Карточки сущностей — НЕ маршруты: единый стек поверх любого раздела
 * (ADR-0009, search `?cards=task:id,project:id`, хост CardStackHost в
 * AppShell): все карточки одной геометрии, наслаиваются без ограничения
 * глубины и комбинаторики вложенных роутов, закрытие верхней возвращает
 * к прежней. Разделные search-параметры (папка писем, тред канала) живут
 * рядом и при открытии карточки сохраняются.
 */
const rootRoute = createRootRoute({
  component: Outlet,
  // Search свободной формы (разделные параметры + стек карточек): identity
  // validateSearch даёт тип Record<string, unknown> для search-апдейтеров
  // navigate и наследование параметров дочерними маршрутами.
  validateSearch: (search: Record<string, unknown>) => search,
});

async function requireAnonymous(): Promise<void> {
  await useAuthStore.getState().bootstrap();
  if (useAuthStore.getState().status === 'authenticated') {
    throw redirect({ to: '/' });
  }
}

async function requireAuth(): Promise<void> {
  await useAuthStore.getState().bootstrap();
  if (useAuthStore.getState().status !== 'authenticated') {
    throw redirect({ to: '/login' });
  }
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: requireAnonymous,
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AppShell,
  beforeLoad: requireAuth,
});

const homeRoute = createRoute({ getParentRoute: () => shellRoute, path: '/', component: HomePage });

const tasksRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/tasks',
  component: TasksPage,
});

const lettersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/letters',
  component: LettersPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects',
  component: ProjectsPage,
});

const chatRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/chat',
  component: ChatPage,
});
const chatConversationRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/chat/$conversationId',
  component: ChatPage,
});

const employeesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/employees',
  component: EmployeesPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    homeRoute,
    tasksRoute,
    lettersRoute,
    projectsRoute,
    chatRoute,
    chatConversationRoute,
    employeesRoute,
  ]),
]);

export const router = createRouter({ routeTree });

// Смена auth-статуса (logout, протухшая сессия) → повторный beforeLoad:
// защищённый маршрут сам уйдёт на /login, /login — на главную.
useAuthStore.subscribe((state, prev) => {
  if (state.status !== prev.status) {
    void router.invalidate();
  }
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
