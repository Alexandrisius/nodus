import { ErrorCode, type CustomFieldScope } from '@nodus/contracts';

import type { ProcessCatalogReader } from '../../workflows/ports/process-catalog-reader.port.js';
import type { WorkflowFieldUsageReader } from '../../workflows/ports/workflow-field-usage.port.js';
import { DomainException } from '../../../core/errors/domain-exception.js';

/**
 * Привязка атрибута к типам процессов (#432, Р8) — одна проверка на все
 * пути записи (`typeIds` в создании/правке и точечные PUT/DELETE): только
 * ЖИВЫЕ типы СВОЕЙ категории. Атрибут задачи в типе письма — мёртвая
 * настройка, а не «расширение на будущее»; архивный тип в привязке не
 * покажет атрибут никому.
 *
 * Неизвестный тип — 404 (не раскрываем существование чужих типов),
 * известный но неподходящий — 422 `CUSTOM_FIELD_BINDING_INVALID`.
 */
export async function assertBindable(
  catalog: ProcessCatalogReader,
  scope: string,
  typeIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(typeIds)];
  if (unique.length === 0) return;
  const refs = await catalog.typeRefs(unique);
  const known = new Map(refs.map((ref) => [ref.id, ref]));
  const missing = unique.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw DomainException.notFound('Process type not found', { typeIds: missing });
  }
  const live = new Set((await catalog.typeRefs(unique, { live: true })).map((ref) => ref.id));
  const invalid = unique.filter((id) => known.get(id)!.category !== scope || !live.has(id));
  if (invalid.length > 0) {
    throw new DomainException(
      ErrorCode.CUSTOM_FIELD_BINDING_INVALID,
      'Field cannot be bound to these process types',
      { typeIds: invalid },
    );
  }
}

/**
 * Снятие привязки не должно ломать работающий маршрут (#432, Р8): если
 * атрибут стоит в опубликованном окне, условии или форме создания маршрута
 * этого типа — 409 со списком процессов. Одна проверка на оба пути снятия:
 * точечный `DELETE …/types/:typeId` и `PATCH` с новым набором `typeIds`.
 */
export async function assertUnbindable(
  workflows: WorkflowFieldUsageReader,
  scope: CustomFieldScope,
  fieldId: string,
  typeIds: readonly string[],
): Promise<void> {
  for (const typeId of typeIds) {
    const usage = await workflows.workflowsUsingField(scope, fieldId, { typeId });
    if (usage.length > 0) {
      throw new DomainException(
        ErrorCode.CUSTOM_FIELD_IN_USE,
        'Custom field is used by the type workflow',
        { workflows: usage },
      );
    }
  }
}
