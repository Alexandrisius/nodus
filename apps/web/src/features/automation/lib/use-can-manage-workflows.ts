import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../../../shared/auth-store.js';

/** Право настройки маршрутов (#378): до матрицы #379 — только роль
 *  администратора (сид выдаёт все права). Сервер — истина (I8); хук прячет
 *  инструменты настройки в UI. */
export function useCanManageWorkflows(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.WORKFLOW_MANAGE);
}
