import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';

/** Право менять роли и их права (#379, ADR-0034). Без него матрица
 *  «Права доступа» — только просмотр: флажки недоступны, сверху видимая
 *  подсказка «Изменять права может администратор». Сервер — истина (I8). */
export function useCanManageRoles(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.ROLE_MANAGE);
}
