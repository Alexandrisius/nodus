/**
 * Применение состава вложений правки сообщения (#188; вынесено из
 * MessagesService — I5: транзакция отправки перевалила порог файла).
 * Содержимое — канон сервиса, вызывается только из edit().
 */

import { DomainException } from '../../../core/errors/domain-exception.js';
import { ErrorCode, type EditMessageBody } from '@nodus/contracts';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { AttachmentsRepository } from './attachments.repository.js';
import type { MessagesRepository } from './messages.repository.js';
import {
  attachmentKindDelta,
  emptyAttachmentDelta,
  type VaultAttachmentDelta,
} from '../vault/vault.repository.js';

/** Зависимости edit (сокращённые Pick — тестируемость без всего сервиса). */
export interface EditAttachmentsDeps {
  repo: Pick<MessagesRepository, 'attachmentsFor'>;
  attachmentsRepo: Pick<
    AttachmentsRepository,
    'syncMessageAttachments' | 'renameMessageAttachments'
  >;
}

/** Применение состава вложений правки (#188): claim новых, detach
 *  убранных, reorder, переименования. Возвращает «была ли реальная смена»
 *  (сигнатура состава+имён до/после — решает editedAt и событие) и Δ
 *  счётчиков витрины по видам (#211: стикеры не правятся, в Δ не входят).
 *  Стикер-сообщение не правится ни составом, ни именами (стикер
 *  неделим, #143). Инвариант непустоты: текст или ≥1 вложение — иначе
 *  валидационная ошибка и откат транзакции (мусорный/чужой id в списке не
 *  оставит сообщение пустым — security-ревью #188). */
export async function syncEditAttachments(
  deps: EditAttachmentsDeps,
  messageId: string,
  userId: string,
  body: EditMessageBody,
  tx: TransactionClient,
): Promise<{ changed: boolean; delta: VaultAttachmentDelta }> {
  if (body.attachmentIds === undefined && body.attachmentRenames === undefined)
    return { changed: false, delta: emptyAttachmentDelta() };
  const before = await deps.repo.attachmentsFor([messageId], tx);
  if (before.some((a) => a.kind === 'sticker'))
    throw DomainException.forbidden('Sticker messages cannot be edited');
  if (body.attachmentIds !== undefined) {
    await deps.attachmentsRepo.syncMessageAttachments(messageId, body.attachmentIds, userId, tx);
  }
  if (body.attachmentRenames !== undefined && body.attachmentRenames.length > 0)
    await deps.attachmentsRepo.renameMessageAttachments(messageId, body.attachmentRenames, tx);
  const after = await deps.repo.attachmentsFor([messageId], tx);
  if (body.text.trim().length === 0 && after.length === 0) {
    throw new DomainException(
      ErrorCode.VALIDATION_FAILED,
      'Message must have text or attachments',
    );
  }
  const signature = (rows: typeof before) => rows.map((a) => `${a.id}:${a.name}`).join('|');
  const changed = signature(before) !== signature(after);
  return { changed, delta: attachmentKindDelta(before, after) };
}
