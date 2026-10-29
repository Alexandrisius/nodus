import { ErrorCode, type ProjectCodeField } from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';

/** Политика системного поля «Шифр» у типа проекта (вердикт владельца
 *  07.11.2026): «Договор» — шифр обязателен, «Тема» — поля нет. Сервер —
 *  истина (I7/I8): клиент, приславший поле, которого у типа нет, получает 400,
 *  а не «тихо потерянный» шифр. */
export function assertCodePolicy(policy: ProjectCodeField, code: string | null): void {
  if (policy === 'required' && !code) {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project code is required by its type');
  }
  if (policy === 'hidden' && code) {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project type has no code field');
  }
}
