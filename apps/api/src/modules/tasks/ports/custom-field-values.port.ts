import type { InjectionToken } from '@nestjs/common';
import type { CustomFieldScope } from '@nodus/contracts';

/**
 * Порт значений атрибутов на задачах (#431): колонка `tasks.custom_fields`
 * принадлежит модулю tasks (I3), поэтому «сколько карточек заполнено» и
 * уборка значений после удаления определения — через порт владельца.
 *
 * Сейчас значения есть только у задач (письма/проекты/контрагенты — #55/#52/Н2):
 * для остальных областей метод отвечает 0. Когда у области появится
 * собственный владелец, композиция сумм переедет к нему (ADR-0010/I13).
 */
export const CUSTOM_FIELD_VALUES_READER: InjectionToken = 'CUSTOM_FIELD_VALUES_READER';

export interface CustomFieldValuesReader {
  /** Число живых сущностей области, у которых ключ атрибута заполнен. */
  countValues(scope: CustomFieldScope, fieldId: string): Promise<number>;
}
