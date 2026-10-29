import { useAuthStore } from '../auth-store.js';
import { isDomainMocked } from './api-mock-config.js';

/**
 * Привязка к проекту работает, только когда сущность и проекты живут в
 * ОДНОМ мире (Р14 #52): либо оба на моках, либо оба на живом API и модуль
 * `projects` включён флагом (`/auth/me.modules`). Иначе живая задача или
 * письмо с мок-проектом получили бы 404 на projectId, а живой проект —
 * маршруты выключенного модуля. Потребители: слот/колонка/фильтр «Проект»
 * в задачах и письмах, атрибуты-проекты, пикер проекта.
 */
export function projectsAvailable(world: 'tasks' | 'letters' = 'tasks'): boolean {
  if (isDomainMocked('projects')) return isDomainMocked(world);
  if (isDomainMocked(world)) return false;
  const modules = useAuthStore.getState().user?.modules;
  return modules?.includes('projects') ?? false;
}
