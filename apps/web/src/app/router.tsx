import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { LoginPage } from '../features/auth/login-page.js';
import { useAuthStore } from '../shared/auth-store.js';
import { UsersPage } from '../features/directory/users-page.js';

/**
 * Роутер SPA (TanStack Router, code-based — файловая маршрутизация при росте).
 * Защита — beforeLoad по auth-store: анонима отправляем на /login,
 * аутентифицированного с /login — на главную. Каркас минимален до M3 (#4).
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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: UsersPage,
  beforeLoad: requireAuth,
});

const routeTree = rootRoute.addChildren([loginRoute, indexRoute]);

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
