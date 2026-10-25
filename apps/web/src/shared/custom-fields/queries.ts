import { useQuery } from '@tanstack/react-query';
import type { CustomFieldDefinition, CustomFieldScope, CustomFieldValues } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Фабрика ключей реестра полей (канон patterns.md: ключи только фабрикой).
 *  Каталожные события `custom_field.*` инвалидируют префикс `all`. */
export const customFieldsKeys = {
  all: ['custom-fields'] as const,
  definitions: (scope?: CustomFieldScope) =>
    [...customFieldsKeys.all, 'definitions', scope ?? 'all'] as const,
};

/** Определения атрибутов области (без области — все). Один запрос на
 *  операцию: таблица ≤ 400 строк, кэш не нужен (Р2). */
export function useCustomFieldDefinitions(scope?: CustomFieldScope) {
  return useQuery({
    queryKey: customFieldsKeys.definitions(scope),
    queryFn: () =>
      api<CustomFieldDefinition[]>(`/custom-fields/definitions${scope ? `?scope=${scope}` : ''}`),
  });
}

/** Терпимое чтение значений из сущности: старый API (:5173 владельца)
 *  атрибуты не отдаёт — блок просто не показывается, карточка не падает. */
export function customFieldValuesOf(entity: {
  customFields?: CustomFieldValues;
}): CustomFieldValues {
  return entity.customFields ?? {};
}

/** Видимые пользователям атрибуты: скрытые (служебные) не попадают в
 *  карточки, фильтры и окна переходов — их видят только реестр и процессы. */
export function visibleDefinitions(
  definitions: readonly CustomFieldDefinition[] | undefined,
): CustomFieldDefinition[] {
  return (definitions ?? []).filter((d) => !d.hidden);
}
