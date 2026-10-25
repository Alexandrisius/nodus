import { z } from 'zod';

/**
 * Ключ кастомного поля в окнах перехода и гейтах (#431, Р7): `cf.<uuid>`.
 * Union с системными полями — надмножество: старые документы маршрутов
 * остаются валидными, новые ключи живут в тех же массивах.
 */

export const CUSTOM_FIELD_KEY_PREFIX = 'cf.';

export const customFieldKeySchema = z.templateLiteral(['cf.', z.uuid()]);
export type CustomFieldKey = z.infer<typeof customFieldKeySchema>;

export function customFieldKey(id: string): CustomFieldKey {
  return `cf.${id}` as CustomFieldKey;
}

/** id определения из ключа; null — ключ не наш (системное поле). */
export function customFieldIdOfKey(key: string): string | null {
  if (!key.startsWith(CUSTOM_FIELD_KEY_PREFIX)) return null;
  const id = key.slice(CUSTOM_FIELD_KEY_PREFIX.length);
  return z.uuid().safeParse(id).success ? id : null;
}
