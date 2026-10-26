import { Injectable } from '@nestjs/common';
import {
  CORRESPONDENCE_EVENTS,
  type DomainEvent,
  type LetterStageChangedPayload,
} from '@nodus/contracts';

import { LetterTransitionBlockService } from './letter-transition-block.service.js';

/**
 * Слушатель `correspondence.letter_stage_changed` (#55, Р10): блок перехода
 * в чате письма. Идемпотентен по id события; регистрируется диспетчером по
 * static eventType (I3: chat узнаёт о письмах событиями).
 */
@Injectable()
export class LetterTransitionBlockHandler {
  static readonly eventType = CORRESPONDENCE_EVENTS.LETTER_STAGE_CHANGED;

  constructor(private readonly blocks: LetterTransitionBlockService) {}

  handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    return this.blocks.post(event as DomainEvent<LetterStageChangedPayload>);
  }
}
