import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';

/** Право добавлять контрагентов и контактные лица (`crm.create`): прячет
 *  «Создать» в реестре, «Создать «…»» в подсказке и добавление контакта.
 *  Сервер — истина (I8): без права ответ 403. */
export function useCanCreateCounterparties(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.CRM_CREATE);
}

/** Право вести справочник (`crm.manage`): правка реквизитов, архив и возврат
 *  контрагента и контактных лиц. */
export function useCanManageCounterparties(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.CRM_MANAGE);
}
