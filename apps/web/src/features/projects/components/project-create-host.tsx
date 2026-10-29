import { useProjectCreateStore } from '../../../shared/projects/project-create-store.js';
import { ProjectCreateDialog } from './project-create-dialog.js';

/**
 * Единственный хост окна создания проекта (#52): монтируется в оболочке
 * рядом с хостом задачи. Любой вход (журнал, пикер проекта) открывает одно
 * окно; размонтирование при закрытии сбрасывает черновик формы.
 */
export function ProjectCreateHost() {
  const prefill = useProjectCreateStore((s) => s.prefill);
  const close = useProjectCreateStore((s) => s.close);
  return prefill ? <ProjectCreateDialog prefill={prefill} onClose={close} /> : null;
}
