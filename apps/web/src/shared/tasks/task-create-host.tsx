import { useState } from 'react';

import type { TaskCreatePrefill } from './task-create-draft.js';
import { useTaskCreateStore } from './task-create-store.js';
import { TaskCreateWindow } from './task-create-window.js';

/**
 * Единственный хост окна создания (#432, Р9): монтируется в оболочке рядом
 * с хостами чата. Любой вход открывает одно окно; после закрытия последнее
 * заполнение держится до конца анимации, чтобы содержимое не пропадало.
 */
export function TaskCreateHost() {
  const prefill = useTaskCreateStore((s) => s.prefill);
  const close = useTaskCreateStore((s) => s.close);
  const [last, setLast] = useState<TaskCreatePrefill | null>(null);
  if (prefill && prefill !== last) setLast(prefill);
  return <TaskCreateWindow open={prefill !== null} prefill={prefill ?? last} onClose={close} />;
}
