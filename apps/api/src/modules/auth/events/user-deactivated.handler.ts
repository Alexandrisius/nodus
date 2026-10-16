import { Injectable } from '@nestjs/common';
import { DIRECTORY_EVENTS, type DomainEvent, type DomainEventHandler } from '@nodus/contracts';

import { AuthRepository } from '../auth.repository.js';

interface UserDeactivatedPayload {
  userId: string;
}

/**
 * Подписчик `directory.user.deactivated`: деактивация сотрудника отзывает
 * все его сессии (действующие access-токены догорают ≤ TTL). Идемпотентен:
 * updateMany по уже отозванным — no-op.
 */
@Injectable()
export class UserDeactivatedHandler implements DomainEventHandler<UserDeactivatedPayload> {
  static readonly eventType = DIRECTORY_EVENTS.USER_DEACTIVATED;

  constructor(private readonly authRepository: AuthRepository) {}

  async handle(event: DomainEvent<UserDeactivatedPayload>): Promise<void> {
    const { userId } = event.payload;
    if (!userId) return;
    await this.authRepository.revokeAllSessions(userId);
  }
}
