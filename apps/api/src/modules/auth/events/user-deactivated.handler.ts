import { Injectable } from '@nestjs/common';
import { DIRECTORY_EVENTS, type DomainEvent, type DomainEventHandler } from '@nodus/contracts';

import { AuthRepository } from '../auth.repository.js';
import { RevokedUsersStore } from '../revoked-users.store.js';

interface UserDeactivatedPayload {
  userId: string;
}

/**
 * Подписчик `directory.user.deactivated`: деактивация сотрудника отзывает
 * все его сессии и действующие access-токены (стоп-лист Redis с моментом
 * деактивации = `createdAt` события, #333). Идемпотентен: updateMany по уже
 * отозванным — no-op; повтор доставки пишет тот же момент.
 */
@Injectable()
export class UserDeactivatedHandler implements DomainEventHandler<UserDeactivatedPayload> {
  static readonly eventType = DIRECTORY_EVENTS.USER_DEACTIVATED;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly revokedUsers: RevokedUsersStore,
  ) {}

  async handle(event: DomainEvent<UserDeactivatedPayload>): Promise<void> {
    const { userId } = event.payload;
    if (!userId) return;
    await this.revokedUsers.revoke(userId, new Date(event.createdAt));
    await this.authRepository.revokeAllSessions(userId);
  }
}
