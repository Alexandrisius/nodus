import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { Inject, Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  ErrorCode,
  LETTER_LIMITS,
  type AuthUser,
  type CreateLetterFields,
  type LetterDetail,
  type UpdateLetterBody,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { FILE_STORAGE, type FileStorage } from '../../../core/ports/file-storage.port.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { companyDate } from '../../../core/time/company-time.js';
import {
  PROCESS_CATALOG_READER,
  type ProcessCatalogReader,
} from '../../workflows/ports/process-catalog-reader.port.js';
import { canRegisterLetters, letterAccessOf } from '../access/letter-access.js';
import { LetterFieldsValidator } from './letter-fields.validator.js';
import { LettersQueryService } from './letters-query.service.js';
import { LettersRepository } from './letters.repository.js';

/** Файл ручного создания: контроллер уже сохранил часть во временный файл. */
export interface UploadedLetterFile {
  name: string;
  mime: string;
  size: number;
  path: string;
}

/**
 * Мутации писем (#55): ручное создание (multipart, атомарно с файлами),
 * правка реквизитов (В3; редизайн #56 — и незарегистрированного по месту в
 * карточке), удаление спама (Р12), присоединение к обсуждению (Р10),
 * приглашение коллеги и личный признак «просмотрено» (редизайн #56). Все —
 * в транзакциях вызывающего слоя; файлы пишутся до транзакции и убираются
 * при её откате.
 */
@Injectable()
export class LettersMutationService {
  constructor(
    private readonly repo: LettersRepository,
    private readonly query: LettersQueryService,
    private readonly validator: LetterFieldsValidator,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(PROCESS_CATALOG_READER) private readonly catalog: ProcessCatalogReader,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
  ) {}

  /** `POST /letters` — ручное письмо (скан бумаги) сразу в «Новые». */
  async create(
    user: AuthUser,
    fields: CreateLetterFields,
    parts: readonly UploadedLetterFile[],
  ): Promise<LetterDetail> {
    if (parts.length === 0) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'At least one file is required');
    }
    if (parts.length > LETTER_LIMITS.files) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Too many files', {
        max: LETTER_LIMITS.files,
      });
    }
    if (fields.mainIndex >= parts.length) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Main document index is out of range',
        {
          mainIndex: fields.mainIndex,
          files: parts.length,
        },
      );
    }
    const type = await this.catalog.resolveType(fields.typeId, {
      category: 'letter',
      requireCreatable: true,
      actorId: user.id,
    });
    if (type.direction !== 'incoming') {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Manual creation is only for incoming letters',
      );
    }
    const stages = await this.catalog.liveStages(type.workflowId);
    const initial = stages.find((stage) => stage.isInitial);
    if (!initial) throw new DomainException(ErrorCode.CONFLICT, 'Workflow has no initial stage');

    const saved: string[] = [];
    try {
      const attachments: { fileId: string; role: string; sortOrder: number }[] = [];
      for (const [index, part] of parts.entries()) {
        const { fileId } = await this.storage.save(
          { ownerId: user.id, name: part.name, mime: part.mime, size: part.size },
          createReadStream(part.path),
        );
        saved.push(fileId);
        attachments.push({
          fileId,
          role: index === fields.mainIndex ? 'main' : 'attachment',
          sortOrder: index,
        });
      }
      const letterId = randomUUID();
      await this.txRunner.run(async (tx) => {
        await this.repo.create(tx, {
          id: letterId,
          typeId: type.id,
          workflowId: type.workflowId,
          stageId: initial.id,
          systemState: initial.systemState,
          direction: 'incoming',
          source: 'manual',
          createdBy: user.id,
          receivedAt: new Date(),
          attachments: { create: attachments },
        });
        await this.eventBus.emit(
          tx,
          CORRESPONDENCE_EVENTS.LETTER_RECEIVED,
          {
            letterId,
            typeId: type.id,
            direction: 'incoming',
            source: 'manual',
            subject: null,
            fileIds: attachments.map((attachment) => attachment.fileId),
          },
          { actorId: user.id, aggregateType: 'letter', aggregateId: letterId },
        );
      });
      return await this.query.detail(user, letterId);
    } catch (error) {
      // Письмо не создалось — объекты хранилища не должны остаться сиротами.
      await this.storage.remove(saved).catch(() => undefined);
      throw error;
    }
  }

  /** `PATCH /letters/:id` — правка реквизитов письма канцелярией по месту в
   *  карточке (редизайн #56): незарегистрированное заполняется до регистрации,
   *  зарегистрированное — как раньше (В3). */
  async update(user: AuthUser, id: string, body: UpdateLetterBody): Promise<LetterDetail> {
    const row = await this.query.visibleRow(user, id);
    if (!canRegisterLetters(user)) {
      throw new DomainException(ErrorCode.LETTER_NOT_EDITABLE, 'Letter is not editable');
    }
    if (body.addresseeId !== undefined && row.registeredAt !== null) {
      // Адресат и номер не меняются после регистрации.
      throw new DomainException(ErrorCode.LETTER_NOT_EDITABLE, 'Addressee is not editable');
    }
    const current = {
      counterpartyId: row.counterpartyId ?? '',
      signerId: row.signerId,
      theirNumber: row.theirNumber ?? '',
      theirDate: row.theirDate ? row.theirDate.toISOString().slice(0, 10) : '',
      subject: row.subject ?? '',
      receiptMethodId: row.receiptMethodId ?? '',
      projectId: row.projectId,
      addresseeId: row.addresseeId ?? '',
      responseDeadline: row.responseDeadline
        ? row.responseDeadline.toISOString().slice(0, 10)
        : null,
      // Правка не касается связей «ответ на» (Р5) — в RegistrationValues
      // поле присутствует, но PATCH его не меняет.
      replyToLetterId: null,
    };
    const { data, changes } = await this.validator.patch(
      current,
      (row.customFields ?? {}) as Record<string, unknown>,
      body,
      row.typeId,
      companyDate(new Date()),
      user,
    );
    if (changes.length === 0) return this.query.detail(user, id);
    // Эффективный подписант: смена корреспондента могла сбросить его в null
    // (валидатор), и проекция CRM не должна оставить чужой контакт.
    const signerChange = changes.find((change) => change.field === 'signerId');
    await this.txRunner.run(async (tx) => {
      await this.repo.lock(tx, id);
      await this.repo.update(tx, id, data);
      await this.eventBus.emit(
        tx,
        CORRESPONDENCE_EVENTS.LETTER_UPDATED,
        {
          letterId: id,
          changes,
          ...(body.counterpartyId !== undefined ? { counterpartyId: body.counterpartyId } : {}),
          ...(signerChange ? { signerId: signerChange.to as string | null } : {}),
        },
        { actorId: user.id, aggregateType: 'letter', aggregateId: id },
      );
    });
    return this.query.detail(user, id);
  }

  /** `DELETE /letters/:id` — спам из «Новые» (Р12 + надгробие #56, Р13):
   *  файлы и вложения сносятся физически, строка письма живёт с deleted_at и
   *  Message-ID — повторный импорт удалённого (сброс UIDVALIDITY, полный
   *  переобход) не возвращает мусор в «Новые». */
  async deleteSpam(user: AuthUser, id: string): Promise<void> {
    const row = await this.query.visibleRow(user, id);
    if (!letterAccessOf(user, row, false).canDeleteSpam) {
      throw new DomainException(ErrorCode.LETTER_NOT_DELETABLE, 'Letter is not deletable');
    }
    const fileIds = await this.repo.fileIds(id);
    await this.txRunner.run(async (tx) => {
      await this.repo.lock(tx, id);
      await this.repo.tombstone(tx, id);
      await this.eventBus.emit(
        tx,
        CORRESPONDENCE_EVENTS.LETTER_DELETED,
        { letterId: id },
        { actorId: user.id, aggregateType: 'letter', aggregateId: id },
      );
    });
    // После коммита: файлы письма больше никому не нужны (best-effort).
    await this.storage.remove(fileIds).catch(() => undefined);
  }

  /** `POST /letters/:id/join` — «Присоединиться к обсуждению» (идемпотентно).
   *  Канцелярия может «начать обсуждение» и до регистрации (редизайн #56),
   *  остальным — только зарегистрированное письмо. */
  async join(user: AuthUser, id: string): Promise<LetterDetail> {
    const row = await this.query.visibleRow(user, id);
    if (row.registeredAt === null && !canRegisterLetters(user)) {
      throw DomainException.notFound('Letter is not registered');
    }
    await this.addOneParticipant(user, id, user.id);
    return this.query.detail(user, id);
  }

  /** Личное присоединение — одиночная вставка (join). */
  private async addOneParticipant(user: AuthUser, id: string, userId: string): Promise<void> {
    await this.txRunner.run(async (tx) => {
      await this.repo.lock(tx, id);
      const created = await this.repo.addParticipant(tx, id, userId);
      if (created) {
        await this.eventBus.emit(
          tx,
          CORRESPONDENCE_EVENTS.LETTER_PARTICIPANTS_CHANGED,
          { letterId: id, added: [userId], removed: [] },
          { actorId: user.id, aggregateType: 'letter', aggregateId: id },
        );
      }
    });
  }

  /** `POST /letters/:id/participants` — пригласить коллег в обсуждение
   *  (редизайн #56; пачка — приёмка 28.10): только канцелярия (гуард
   *  контроллера), письмо в любом состоянии; повторные приглашения — не
   *  ошибка, просто текущий состав. Событие состава — одно на пачку. */
  async addParticipants(user: AuthUser, id: string, userIds: string[]): Promise<LetterDetail> {
    await this.query.visibleRow(user, id);
    const active = await this.profiles.filterActiveUserIds(userIds);
    if (active.length !== userIds.length) {
      throw DomainException.notFound('User not found');
    }
    const added: string[] = [];
    await this.txRunner.run(async (tx) => {
      await this.repo.lock(tx, id);
      for (const userId of userIds) {
        if (await this.repo.addParticipant(tx, id, userId)) added.push(userId);
      }
      if (added.length > 0) {
        await this.eventBus.emit(
          tx,
          CORRESPONDENCE_EVENTS.LETTER_PARTICIPANTS_CHANGED,
          { letterId: id, added, removed: [] },
          { actorId: user.id, aggregateType: 'letter', aggregateId: id },
        );
      }
    });
    return this.query.detail(user, id);
  }

  /** `POST /letters/:id/view` — личный признак «просмотрено» (редизайн #56):
   *  не бизнес-действие — без аудита и события; идемпотентен. */
  async markViewed(user: AuthUser, id: string): Promise<void> {
    await this.query.visibleRow(user, id);
    await this.repo.markViewed(id, user.id);
  }
}
