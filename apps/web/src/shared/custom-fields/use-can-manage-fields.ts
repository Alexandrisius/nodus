import { Permission } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';

/** Право создавать и править кастомные поля (#431, Р13). Читают определения
 *  все; сервер — истина (I8), хук прячет инструменты настройки в UI.
 *  Живёт в shared: потребители — вкладка «Поля» и блок карточки задачи
 *  (кросс-фичевый импорт запрещён, I6). */
export function useCanManageFields(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.CUSTOM_FIELD_MANAGE);
}
