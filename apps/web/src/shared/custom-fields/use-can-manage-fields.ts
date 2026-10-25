import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';

/** Право создавать, править и удалять атрибуты (кастомные поля, #431, Р13).
 *  Читают определения все; сервер — истина (I8), хук прячет инструменты
 *  настройки во вкладке «Атрибуты» «Автоматизации». */
export function useCanManageFields(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.CUSTOM_FIELD_MANAGE);
}
