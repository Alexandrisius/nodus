import { Inject, Injectable } from '@nestjs/common';

import type { TransactionClient } from '../../core/database/transaction-runner.js';
import {
  ROLE_MEMBERSHIP_READER,
  type RoleMembershipReader,
} from '../../core/ports/role-membership.port.js';
import { AuthRepository, type AuthIdentity } from './auth.repository.js';

/**
 * Единственный источник прав для входа, refresh и `/auth/me` (#379,
 * ADR-0034 п. 4): профиль из `AuthRepository` + права из порта
 * `ROLE_MEMBERSHIP_READER` (прямые роли ∪ роли подразделения и предков).
 * Прямой join по `user_roles` в auth больше не собирается — иначе роль,
 * выданная подразделению, не действовала бы на его сотрудников.
 */
@Injectable()
export class IdentityLoader {
  constructor(
    private readonly authRepository: AuthRepository,
    @Inject(ROLE_MEMBERSHIP_READER) private readonly membership: RoleMembershipReader,
  ) {}

  async load(userId: string, tx?: TransactionClient): Promise<AuthIdentity | null> {
    const profile = await this.authRepository.findProfileById(userId, tx);
    if (!profile) return null;
    return { ...profile, permissions: await this.membership.effectivePermissions(userId, tx) };
  }
}
