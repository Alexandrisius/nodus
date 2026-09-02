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
const TaskSliderPage = lazy(() =>
  import('../features/tasks/pages/task-slider-page.js').then((m) => ({
    default: m.TaskSliderPage,
  })),
);
const LettersPage = lazy(() =>
  import('../features/correspondence/pages/letters-page.js').then((m) => ({
    default: m.LettersPage,
  })),
);
const LettersSliderPage = lazy(() =>
  import('../features/correspondence/pages/letters-slider-page.js').then((m) => ({
    default: m.LettersSliderPage,
  })),
);
const ProjectsPage = lazy(() =>
  import('../features/projects/pages/projects-page.js').then((m) => ({ default: m.ProjectsPage })),
);
const ProjectSliderPage = lazy(() =>
  import('../features/projects/pages/project-slider-page.js').then((m) => ({
    default: m.ProjectSliderPage,
  })),
);
const ChatPage = lazy(() =>
  import('../features/chat/pages/chat-page.js').then((m) => ({ default: m.ChatPage })),
);
const UsersPage = lazy(() =>
  import('../features/directory/users-page.js').then((m) => ({ default: m.UsersPage })),
);

/**
 * Роутер SPA (TanStack Router, code-splitting по модулям).
 * Слайдеры — вложенные маршруты: у каждого уровня стека свой URL (§10.2).
 */
const rootRoute = createRootRoute({ component: Outlet });

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
const taskSliderRoute = createRoute({
  getParentRoute: () => tasksRoute,
  path: '/$taskId',
  component: TaskSliderPage,
});
const taskProjectSliderRoute = createRoute({
  getParentRoute: () => taskSliderRoute,
  path: '/project/$projectId',
  component: ProjectSliderPage,
});

const lettersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/letters',
  component: LettersPage,
});
const letterSliderRoute = createRoute({
  getParentRoute: () => lettersRoute,
  path: '/$letterId',
  component: LettersSliderPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects',
  component: ProjectsPage,
});
const projectSliderRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '/$projectId',
  component: ProjectSliderPage,
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
  component: UsersPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    homeRoute,
    tasksRoute.addChildren([taskSliderRoute.addChildren([taskProjectSliderRoute])]),
    lettersRoute.addChildren([letterSliderRoute]),
    projectsRoute.addChildren([projectSliderRoute]),
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
