import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { WorkflowFormApplied } from '../../../core/ports/workflow-entity.port.js';
import { companyDate } from '../../../core/time/company-time.js';
import type { LetterDetailRow } from '../letters/letter-row.js';
import { LettersRepository } from '../letters/letters.repository.js';
import { LetterFieldsValidator, asDate } from '../letters/letter-fields.validator.js';

const EMPTY: WorkflowFormApplied = { fields: {}, timeEntryId: null, result: null };

const isoOf = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/**
 * Применение окна «Регистрация» (#55, Р1): проверка тех же полей, что у
 * формы, и запись реквизитов в письмо. Номер письма здесь НЕ ставится —
 * его выдаёт движок пост-действием `assign_number` и передаёт адаптеру в
 * `meta.numbering` (транзакция одна).
 */
@Injectable()
export class LetterFormApplier {
  constructor(
    private readonly letters: LettersRepository,
    private readonly validator: LetterFieldsValidator,
  ) {}

  async apply(
    tx: TransactionClient,
    letter: LetterDetailRow,
    actor: Pick<AuthUser, 'id'>,
    input: { registration?: unknown },
  ): Promise<WorkflowFormApplied> {
    if (!input.registration) return EMPTY;
    const { values, customFields } = await this.validator.registration(
      letter.typeId,
      input.registration,
      actor.id,
      companyDate(new Date()),
    );
    const fields: WorkflowFormApplied['fields'] = {};
    const diff = (field: string, from: unknown, to: unknown): void => {
      if (String(from ?? '') === String(to ?? '')) return;
      fields[field] = { from, to };
    };
    diff('counterpartyId', letter.counterpartyId, values.counterpartyId);
    diff('signerId', letter.signerId, values.signerId);
    diff('theirNumber', letter.theirNumber, values.theirNumber);
    diff('theirDate', isoOf(letter.theirDate), values.theirDate);
    diff('subject', letter.subject, values.subject);
    diff('receiptMethodId', letter.receiptMethodId, values.receiptMethodId);
    diff('projectId', letter.projectId, values.projectId);
    diff('addresseeId', letter.addresseeId, values.addresseeId);
    diff('responseDeadline', isoOf(letter.responseDeadline), values.responseDeadline);

    await this.letters.update(tx, letter.id, {
      counterpartyId: values.counterpartyId,
      signerId: values.signerId,
      theirNumber: values.theirNumber,
      theirDate: asDate(values.theirDate),
      subject: values.subject,
      receiptMethodId: values.receiptMethodId,
      projectId: values.projectId,
      addresseeId: values.addresseeId,
      responseDeadline: asDate(values.responseDeadline),
      customFields: customFields as Prisma.InputJsonValue,
    });
    return { fields, timeEntryId: null, result: null };
  }
}
