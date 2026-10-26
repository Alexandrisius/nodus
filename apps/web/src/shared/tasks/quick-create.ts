import { toast } from 'sonner';
import { ErrorCode, defaultCreationForm, requiredCreateKeys, ui } from '@nodus/contracts';

import { ApiError } from '../api-client.js';
import { useCreateTask } from '../api/task-create.js';
import { useCreatableProcessTypes } from '../api/process-types-api.js';
import { DEFAULT_TASK_TYPE_CODE } from '@nodus/contracts';
import { buildCreateBody, emptyDraft, type TaskCreatePrefill } from './task-create-draft.js';
import { openTaskCreate } from './task-create-store.js';

/**
 * Быстрые входы (#432, Р10): плюсик колонки, плюсик доски проекта, строка
 * подзадачи, «В задачу» из сообщения. Решение «создать сразу или открыть
 * окно» — по эффективной форме типа быстрых входов (код `task`): если в ней
 * есть обязательный слот, окно нужно; скрытые значения окна не требуют —
 * их ставит сервер. Типы ещё не загружены — создаём: на отказ 422
 * PROCESS_TYPE_FIELDS_REQUIRED окно открывается с заполнением.
 */
export function useQuickCreate() {
  const create = useCreateTask();
  const { data: types } = useCreatableProcessTypes();

  /** Маршрут входа без сети: 'create' — можно создавать сразу. */
  const route = (): 'create' | 'window' => {
    const type = types?.find((entry) => entry.code === DEFAULT_TASK_TYPE_CODE) ?? types?.[0];
    if (!type) return 'create';
    return requiredCreateKeys(type.creationForm).length > 0 ? 'window' : 'create';
  };

  const run = (prefill: TaskCreatePrefill = {}): void => {
    if (route() === 'window') {
      openTaskCreate(prefill);
      return;
    }
    const type = types?.find((entry) => entry.code === DEFAULT_TASK_TYPE_CODE) ?? types?.[0];
    const form = type?.creationForm ?? defaultCreationForm('task');
    create.mutate(buildCreateBody(emptyDraft(prefill), prefill, form), {
      onSuccess: (task) => {
        prefill.onCreated?.(task);
        toast.success(ui.tasks.created);
      },
      onError: (error) => {
        // Тип требует обязательных полей — окно с уже введённым.
        if (error instanceof ApiError && error.code === ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED) {
          openTaskCreate(prefill);
          return;
        }
        toast.error(
          error instanceof ApiError && error.code === ErrorCode.PROCESS_TYPE_FORBIDDEN
            ? ui.taskCreate.forbidden
            : ui.taskCreate.submitFailed,
        );
      },
    });
  };

  return { route, run };
}
