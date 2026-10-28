import { Inject, Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  ErrorCode,
  type AuthUser,
  type LetterDetail,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import {
  FILE_OBJECT_READER,
  type FileObjectReader,
} from '../../../core/ports/file-object-reader.port.js';
import { canRegisterLetters } from '../access/letter-access.js';
import { LettersQueryService } from './letters-query.service.js';
import { LettersRepository } from './letters.repository.js';

/**
 * Выбор основного документа письма звездой («Основной документ письма» #56):
 * канцелярия, только до регистрации — после номер присвоен документу и выбор
 * заморожен. Кандидаты — файлы (вложения и PDF-копия тела `body_pdf`); текст
 * почты (`body`) кандидатом не является. Выбранный файл становится `main`,
 * прежний `main` — приложением; PDF-копия тела роль не меняет и становится
 * главным де-факто. Смена — история `letter_updated` (поле `mainDocument`).
 */
@Injectable()
export class LettersMainDocumentService {
  constructor(
    private readonly repo: LettersRepository,
    private readonly query: LettersQueryService,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(FILE_OBJECT_READER) private readonly files: FileObjectReader,
  ) {}

  /** `POST /letters/:id/main-document` — выбор основного документа звездой
   *  («Основной документ письма» #56): канцелярия, только до регистрации —
   *  после номер присвоен документу и выбор заморожен. Кандидаты — файлы
   *  (вложения и PDF-копия тела); текст почты кандидатом не является.
   *  Повтор того же выбора — не ошибка (идемпотентность). */
  async set(user: AuthUser, id: string, attachmentId: string): Promise<LetterDetail> {
    const row = await this.query.visibleRow(user, id);
    if (!canRegisterLetters(user)) {
      throw new DomainException(ErrorCode.LETTER_NOT_EDITABLE, 'Letter is not editable');
    }
    if (row.registeredAt !== null) {
      throw new DomainException(ErrorCode.LETTER_NOT_EDITABLE, 'Main document is frozen');
    }
    const attachments = await this.repo.attachments(id);
    const target = attachments.find((a) => a.id === attachmentId);
    if (
      !target ||
      target.inline ||
      (target.role !== 'attachment' && target.role !== 'body_pdf' && target.role !== 'main')
    ) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Attachment is not a main document candidate',
      );
    }
    const mainBefore = attachments.find((a) => a.role === 'main') ?? null;
    const bodyPdfBefore = attachments.find((a) => a.role === 'body_pdf') ?? null;
    const effectiveBefore = mainBefore ?? bodyPdfBefore;
    // Звезда на PDF-копии тела: роль body_pdf неизменна — главным текст
    // становится де-факто (main сбрасывается); на файле — файл становится
    // main, прежний main уходит в приложения.
    const effectiveAfter = target;
    if (effectiveBefore?.id === effectiveAfter.id) {
      return this.query.detail(user, id);
    }
    const names = new Map(
      (await this.files.refs(attachments.map((a) => a.fileId))).map((f) => [f.id, f.name]),
    );
    const displayName = (a: (typeof attachments)[number]): string =>
      a.role === 'body_pdf' ? 'Текст письма.pdf' : (names.get(a.fileId) ?? 'Документ');
    const promoteId = target.role === 'attachment' ? target.id : undefined;
    const demoteIds = mainBefore ? [mainBefore.id] : [];
    await this.txRunner.run(async (tx) => {
      await this.repo.lock(tx, id);
      await this.repo.setMainRoles(tx, id, { promoteId, demoteIds });
      await this.eventBus.emit(
        tx,
        CORRESPONDENCE_EVENTS.LETTER_UPDATED,
        {
          letterId: id,
          changes: [
            {
              field: 'mainDocument',
              from: effectiveBefore ? displayName(effectiveBefore) : null,
              to: displayName(effectiveAfter),
            },
          ],
        },
        { actorId: user.id, aggregateType: 'letter', aggregateId: id },
      );
    });
    return this.query.detail(user, id);
  }
}
