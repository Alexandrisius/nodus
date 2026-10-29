import { usePortalSettingsStore } from '../../../shared/projects/portal-settings-store.js';
import { PortalSettingsDialog } from './portal-settings-dialog.js';

/** Хост окна «Настройки портала»: монтируется в оболочке, открывается из
 *  меню профиля и страницы «Типы проектов». */
export function PortalSettingsHost() {
  const open = usePortalSettingsStore((s) => s.open);
  const close = usePortalSettingsStore((s) => s.close);
  return open ? <PortalSettingsDialog onClose={close} /> : null;
}
