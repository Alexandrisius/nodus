import type { CustomFieldScope, WorkflowCustomFieldFacts } from '@nodus/contracts';

import type { TransactionClient } from '../../../../core/database/transaction-runner.js';
import type { CustomFieldRegistry } from '../../../custom-fields/ports/custom-field-registry.port.js';

/**
 * Факты атрибутов для проверки документа маршрута (#431, Р7): активные id
 * области, отдельно скрытые и — с #432 — привязанные к типу процесса.
 * Область = категория маршрута (`task`/`letter`). Вынесено из сервиса
 * публикации: сервис остаётся в пределах лимита строк, а правило «что
 * считается существующим атрибутом» живёт в одном месте.
 */
export async function customFieldFactsOf(
  registry: CustomFieldRegistry,
  scope: CustomFieldScope,
  tx: TransactionClient,
  typeId?: string,
): Promise<WorkflowCustomFieldFacts> {
  const definitions = await registry.definitions(scope, {}, tx);
  return {
    active: new Set(definitions.map((definition) => definition.id)),
    hidden: new Set(
      definitions.filter((definition) => definition.hidden).map((definition) => definition.id),
    ),
    ...(typeId
      ? {
          inType: new Set(
            definitions
              .filter((definition) => definition.typeIds.includes(typeId))
              .map((definition) => definition.id),
          ),
        }
      : {}),
  };
}
