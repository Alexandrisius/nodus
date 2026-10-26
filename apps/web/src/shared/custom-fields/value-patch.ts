import type { CustomFieldRef, CustomFieldValue } from '@nodus/contracts';
import { ErrorCode, errorMessages, ui } from '@nodus/contracts';

import { ApiError } from '../api-client.js';

/** Оптимистичная правка одного атрибута карточки (#431) — общая для задач и
 *  писем (I6: фичи друг друга не импортируют). */

/** Значения с патчем: `null` удаляет ключ (пустое не хранится, Р1). */
export function patchedValues(
  values: Record<string, CustomFieldValue> | undefined,
  fieldId: string,
  value: CustomFieldValue | null,
): Record<string, CustomFieldValue> {
  const next = { ...(values ?? {}) };
  if (value === null) delete next[fieldId];
  else next[fieldId] = value;
  return next;
}

/** Ссылки выбора поверх прежних (по id: имя и архив обновляются). */
export function mergedRefs(
  refs: readonly CustomFieldRef[] | undefined,
  added: readonly CustomFieldRef[] | undefined,
): CustomFieldRef[] {
  if (!added || added.length === 0) return [...(refs ?? [])];
  const byId = new Map((refs ?? []).map((ref) => [ref.id, ref]));
  for (const ref of added) byId.set(ref.id, ref);
  return [...byId.values()];
}

/** Текст отказа: причина конкретного поля из `details.issues` (Р2) читается
 *  понятнее общего «не удалось сохранить». */
export function fieldErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code === ErrorCode.CUSTOM_FIELD_VALUE_INVALID) {
    const details = error.details as { issues?: Array<{ reason?: string }> } | undefined;
    const reason = details?.issues?.[0]?.reason;
    if (reason && reason in ui.customFields.issues) {
      return ui.customFields.issues[reason as keyof typeof ui.customFields.issues];
    }
  }
  if (error instanceof ApiError && error.code in errorMessages) {
    return errorMessages[error.code as ErrorCode];
  }
  return ui.common.saveError;
}
