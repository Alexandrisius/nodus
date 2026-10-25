import { useQuery } from '@tanstack/react-query';
import type { CustomFieldDefinition, CustomFieldScope, CustomFieldValues } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Фабрика ключей реестра полей (канон patterns.md: ключи только фабрикой).
 *  Каталожные события `custom_field.*` инвалидируют префикс `all`. */
export const customFieldsKeys = {
  all: ['custom-fields'] as const,
  definitions: (scope?: CustomFieldScope, archived: 'include' | 'only' = 'include') =>
    [...customFieldsKeys.all, 'definitions', scope ?? 'all', archived] as const,
};

/** Определения полей области (по умолчанию — все области и архив). Один
 *  запрос на операцию: таблица ≤ 400 строк, кэш не нужен (Р2). */
export function useCustomFieldDefinitions(
  scope?: CustomFieldScope,
  opts: { archived?: 'include' | 'only' } = {},
) {
  const archived = opts.archived ?? 'include';
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (archived !== 'include') params.set('archived', archived);
  const query = params.toString();
  return useQuery({
    queryKey: customFieldsKeys.definitions(scope, archived),
    queryFn: () =>
      api<CustomFieldDefinition[]>(`/custom-fields/definitions${query ? `?${query}` : ''}`),
  });
}

/** Терпимое чтение значений из сущности: старый API (:5173 владельца) поля
 *  не отдаёт — блок «Поля» просто не показывается, карточка не падает. */
export function customFieldValuesOf(entity: {
  customFields?: CustomFieldValues;
}): CustomFieldValues {
  return entity.customFields ?? {};
}

/** Активные определения области (архив скрыт из карточек, окон и фильтров). */
export function activeDefinitions(
  definitions: readonly CustomFieldDefinition[] | undefined,
): CustomFieldDefinition[] {
  return (definitions ?? []).filter((d) => d.archivedAt === null);
}
