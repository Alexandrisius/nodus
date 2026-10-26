import { Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  type DomainEvent,
  type LetterUpdatedPayload,
} from '@nodus/contracts';

import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { LetterChatService } from './letter-chat.service.js';

/**
 * Подписчики `correspondence.*` (#55, Р10): chat узнаёт о письмах только
 * событиями (I3). Регистрация и состав участников — синхронизация беседы;
 * правка темы — обновление строки списка; удаление спама — роспуск состава
 * (sync видит roster=null). Идемпотентны: повторная доставка outbox даёт тот
 * же состав.
 */
@Injectable()
export class LetterChatSyncRunner {
  constructor(
    private readonly chat: LetterChatService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async run(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('chat'))) return;
    const letterId = event.payload.letterId;
    if (typeof letterId === 'string') await this.chat.sync(letterId, event.actorId);
  }
}

const handlerFor = (eventType: string) => {
  @Injectable()
  class Handler {
    static readonly eventType = eventType;
    constructor(readonly runner: LetterChatSyncRunner) {}
    handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
      return this.runner.run(event);
    }
  }
  return Handler;
};

@Injectable()
export class LetterRegisteredChatHandler extends handlerFor(
  CORRESPONDENCE_EVENTS.LETTER_REGISTERED,
) {}
@Injectable()
export class LetterParticipantsChatHandler extends handlerFor(
  CORRESPONDENCE_EVENTS.LETTER_PARTICIPANTS_CHANGED,
) {}
@Injectable()
export class LetterDeletedChatHandler extends handlerFor(CORRESPONDENCE_EVENTS.LETTER_DELETED) {}

/** Правка темы — строки «Чатов задач и писем» у участников обновляются. */
@Injectable()
export class LetterUpdatedChatHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_UPDATED;
  constructor(
    private readonly chat: LetterChatService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    if (!(await this.featureFlags.isEnabled('chat'))) return;
    const payload = event.payload as unknown as LetterUpdatedPayload;
    if (payload.changes?.some((change) => change.field === 'subject')) {
      await this.chat.touch(payload.letterId, event.actorId);
    }
  }
}
