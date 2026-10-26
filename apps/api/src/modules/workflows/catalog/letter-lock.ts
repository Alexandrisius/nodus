import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';

/**
 * Замок каталога писем (#55, Р4/O4): до #463 (входящие) и #464 (исходящие)
 * типы и маршруты писем — только просмотр. Правка поставила бы `customizedAt`
 * и навсегда отключила ревизии каталога: заготовка маршрута перестала бы
 * дополняться вместе с задачей резолюции.
 *
 * Снятие — удаление направления из множества в #463/#464 (не «флаг»):
 * открытие входящего не должно открывать исходящее.
 */
export const LOCKED_LETTER_DIRECTIONS = new Set(['incoming', 'outgoing']);

/** Направление письма под замком (null/чужое направление — не письмо). */
export function isLetterCatalogLocked(direction: string | null | undefined): boolean {
  return direction !== null && direction !== undefined && LOCKED_LETTER_DIRECTIONS.has(direction);
}

/** 409 `PROCESS_TYPE_SYSTEM_LOCKED {reason:'letter_catalog'}` для письма. */
export function assertLetterCatalogEditable(type: {
  category: string;
  direction: string | null;
}): void {
  if (type.category === 'letter' && isLetterCatalogLocked(type.direction)) {
    throw new DomainException(
      ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED,
      'Letter catalog is locked until resolution and outgoing issues',
      { reason: 'letter_catalog', direction: type.direction },
    );
  }
}
