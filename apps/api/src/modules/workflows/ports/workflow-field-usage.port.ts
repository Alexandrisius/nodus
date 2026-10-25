import type { InjectionToken } from '@nestjs/common';
import type { CustomFieldScope } from '@nodus/contracts';

/**
 * Порт «где атрибут используется в процессах» (#431, вердикт владельца
 * 25.10.2026): удаление атрибута запрещено, пока он стоит в окне перехода
 * или в условии «Заполнены поля» опубликованного маршрута области. Таблицы
 * процессов принадлежат модулю workflows (I3) — модуль атрибутов спрашивает
 * порт, а не читает `workflow_transitions` сам.
 *
 * Ссылка — ключ `cf.<uuid>` в разделах окна и в валидаторах `fields_required`.
 * Области писем/проектов/контрагентов в #431 не имеют маршрутов: для них
 * список пуст (появится вместе с модулями, #55/#52).
 */
export const WORKFLOW_FIELD_USAGE_READER: InjectionToken = 'WORKFLOW_FIELD_USAGE_READER';

/** Маршрут, использующий атрибут: `id` — маршрут, `name` — тип процесса. */
export interface WorkflowFieldUsage {
  id: string;
  name: string;
}

export interface WorkflowFieldUsageReader {
  workflowsUsingField(scope: CustomFieldScope, fieldId: string): Promise<WorkflowFieldUsage[]>;
}
