import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';

/** Право настройки маршрутов (#378): по умолчанию у администратора, ролям
 *  выдаётся во вкладке «Права доступа» «Автоматизации» (#379, ADR-0034).
 *  Сервер — истина (I8); хук прячет инструменты настройки в UI. Живёт в
 *  shared: потребители — и «Автоматизация», и единое окно создания (#432). */
export function useCanManageWorkflows(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.WORKFLOW_MANAGE);
}
