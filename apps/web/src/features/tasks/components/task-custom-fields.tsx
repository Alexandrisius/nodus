import { useNavigate } from '@tanstack/react-router';
import type { TaskDetail } from '@nodus/contracts';

import { CustomFieldsBlock } from '../../../shared/custom-fields/custom-fields-block.js';
import { customFieldValuesOf } from '../../../shared/custom-fields/queries.js';
import { useCanManageFields } from '../../../shared/custom-fields/use-can-manage-fields.js';
import { useUpdateTaskCustomField } from '../api/task-custom-field-api.js';

/**
 * Блок «Поля» карточки задачи (#431): значения из детали, правка по месту
 * оптимистично (I4). «Настроить» — только с правом `custom_field.manage` и
 * ведёт во вкладку «Поля» с областью «Задачи». Старый API (:5173) поля не
 * отдаёт — `customFieldValuesOf` терпит, блок живёт пустым.
 */
export function TaskCustomFields({ task }: { task: TaskDetail }) {
  const navigate = useNavigate();
  const canManage = useCanManageFields();
  const update = useUpdateTaskCustomField(task.id);

  return (
    <CustomFieldsBlock
      scope="task"
      values={customFieldValuesOf(task)}
      refs={task.customFieldRefs ?? []}
      canEdit={task.access.canEdit}
      onChange={(fieldId, value, refs) => update.mutate({ fieldId, value, refs })}
      onConfigure={
        canManage
          ? () =>
              void navigate({
                to: '/automation',
                search: { tab: 'fields', scope: 'task', field: undefined },
              })
          : undefined
      }
    />
  );
}
