import { Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  type DomainEvent,
  type LetterRegisteredPayload,
  type LetterUpdatedPayload,
} from '@nodus/contracts';

import { CounterpartyUsagesRepository } from '../counterparties/counterparty-usages.repository.js';

/**
 * Проекция «письма контрагента» (#55, B6; ADR-0033 п.3): регистрация пишет
 * строку использования (корреспондент + подписант), правка обновляет её,
 * удаление спама — убирает. Обработчики идемпотентны (upsert/updateMany/
 * deleteMany), повторная доставка outbox безопасна.
 */
@Injectable()
export class LetterRegisteredUsageHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_REGISTERED;

  constructor(private readonly usages: CounterpartyUsagesRepository) {}

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const payload = event.payload as unknown as LetterRegisteredPayload;
    await this.usages.upsertLetter({
      sourceId: payload.letterId,
      counterpartyId: payload.counterpartyId,
      contactId: payload.signerId,
    });
  }
}

@Injectable()
export class LetterUpdatedUsageHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_UPDATED;

  constructor(private readonly usages: CounterpartyUsagesRepository) {}

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const payload = event.payload as unknown as LetterUpdatedPayload;
    if (payload.counterpartyId) {
      const current = await this.usages.findLetter(payload.letterId);
      // Смена корреспондента: подписант — из payload, иначе прежний (его
      // сервер мог сбросить, тогда signerId пришёл null явно).
      await this.usages.upsertLetter({
        sourceId: payload.letterId,
        counterpartyId: payload.counterpartyId,
        contactId: payload.signerId !== undefined ? payload.signerId : (current?.contactId ?? null),
      });
      return;
    }
    if (payload.signerId !== undefined) {
      await this.usages.updateLetterContact(payload.letterId, payload.signerId);
    }
  }
}

@Injectable()
export class LetterDeletedUsageHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_DELETED;

  constructor(private readonly usages: CounterpartyUsagesRepository) {}

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const letterId = event.payload.letterId;
    if (typeof letterId === 'string') await this.usages.deleteLetter(letterId);
  }
}
