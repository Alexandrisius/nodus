import { Injectable } from '@nestjs/common';
import { CORRESPONDENCE_EVENTS, type LetterStageChangedPayload } from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { companyDate } from '../../../core/time/company-time.js';
import type {
  WorkflowEntityStage,
  WorkflowStageChangeMeta,
} from '../../../core/ports/workflow-entity.port.js';
import type { LetterDetailRow } from '../letters/letter-row.js';
import { LettersRepository } from '../letters/letters.repository.js';

/**
 * Смена стадии письма (#55, Р1/Р5): денормализация `system_state`, событие
 * `letter_stage_changed` (блок чата), при номере — регистрационные поля и
 * `letter_registered` (мост чата синхронизирует состав), при закрытии без
 * регистрации — `letter_closed_unregistered`.
 */
@Injectable()
export class LetterStageMover {
  constructor(
    private readonly letters: LettersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async apply(
    tx: TransactionClient,
    letter: LetterDetailRow,
    target: WorkflowEntityStage,
    actorId: string | null,
    meta: WorkflowStageChangeMeta,
  ): Promise<void> {
    const numbering = meta.numbering;
    const data: Prisma.LetterUncheckedUpdateInput = {
      stageId: target.id,
      systemState: target.systemState,
      stateChangedAt: new Date(),
      ...(numbering
        ? {
            regNumber: numbering.display,
            regSeriesId: numbering.seriesId,
            regYear: numbering.year,
            regSeq: numbering.seq,
            regDate: new Date(`${companyDate(numbering.assignedAt)}T00:00:00.000Z`),
            registeredAt: numbering.assignedAt,
            registrarId: actorId,
          }
        : {}),
    };
    await this.letters.update(tx, letter.id, data);

    const stageChanged: LetterStageChangedPayload = {
      letterId: letter.id,
      fromStageId: letter.stageId,
      toStageId: target.id,
      toStageName: target.name,
      fromState: letter.systemState as LetterStageChangedPayload['fromState'],
      toState: target.systemState as LetterStageChangedPayload['toState'],
      toStageOutcome: (target.outcome ?? null) as LetterStageChangedPayload['toStageOutcome'],
      transitionId: meta.transitionId,
      cause: meta.cause === 'transition' ? 'transition' : 'migration',
      ...(meta.recordId ? { recordId: meta.recordId } : {}),
      ...(meta.transitionName ? { transitionName: meta.transitionName } : {}),
      ...(meta.fromStageName ? { fromStageName: meta.fromStageName } : {}),
      ...(meta.comment ? { comment: meta.comment } : {}),
      ...(meta.commentLabel ? { commentLabel: meta.commentLabel } : {}),
    };
    await this.eventBus.emit(tx, CORRESPONDENCE_EVENTS.LETTER_STAGE_CHANGED, stageChanged, {
      actorId,
      aggregateType: 'letter',
      aggregateId: letter.id,
    });

    // Событие регистрации несёт состав для моста чата: без корреспондента,
    // адресата и регистратора оно неполно (нумерация без формы — #464).
    if (numbering && letter.counterpartyId && letter.addresseeId && actorId) {
      await this.eventBus.emit(
        tx,
        CORRESPONDENCE_EVENTS.LETTER_REGISTERED,
        {
          letterId: letter.id,
          typeId: letter.typeId,
          direction: letter.direction,
          regNumber: numbering.display,
          registeredAt: numbering.assignedAt.toISOString(),
          counterpartyId: letter.counterpartyId,
          signerId: letter.signerId,
          addresseeId: letter.addresseeId,
          registrarId: actorId,
          projectId: letter.projectId,
        },
        { actorId, aggregateType: 'letter', aggregateId: letter.id },
      );
    }
    if (target.code === 'not_registered') {
      await this.eventBus.emit(
        tx,
        CORRESPONDENCE_EVENTS.LETTER_CLOSED_UNREGISTERED,
        { letterId: letter.id },
        { actorId, aggregateType: 'letter', aggregateId: letter.id },
      );
    }
  }
}
