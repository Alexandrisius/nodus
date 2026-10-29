import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type AuthUser } from '@nodus/contracts';

import type { TransactionClient } from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import {
  ROLE_MEMBERSHIP_READER,
  type RoleMembershipReader,
} from '../../core/ports/role-membership.port.js';
import { addedRoleIds, rolesNotHeld } from './role-permission-rules.js';
import { RolesRepository } from './roles.repository.js';

/**
 * bind-правило назначения ролей (#490, ADR-0034 «Дополнение» п. 6, модель
 * Kubernetes RBAC): у актора должны быть все права каждой ДОБАВЛЯЕМОЙ роли —
 * явной (`roleIds` в `POST/PATCH /directory/users`) или неявной (роль,
 * привязанная к подразделению сотрудника и его предкам: перевод сотрудника
 * и перенос подразделения). Отзыв ролей правами не ограничен. Отказ — 403
 * `ROLE_PERMISSION_NOT_HELD` (`details.permissions` — недостающие) внутри
 * транзакции вызователя: уже применённая мутация откатывается целиком.
 */
@Injectable()
export class RoleAssignmentGuard {
  constructor(
    private readonly roles: RolesRepository,
    @Inject(ROLE_MEMBERSHIP_READER) private readonly membership: RoleMembershipReader,
  ) {}

  /** Эффективные роли сотрудника сейчас (снимок «до» для последующей проверки). */
  effectiveRoleIds(userId: string, tx: TransactionClient): Promise<string[]> {
    return this.membership.effectiveRoleIds(userId, tx);
  }

  /** Снимок эффективных ролей сотрудников до мутации (перенос подразделения). */
  async snapshotEffectiveRoles(
    userIds: readonly string[],
    tx: TransactionClient,
  ): Promise<Map<string, string[]>> {
    const byUser = new Map<string, string[]>();
    for (const userId of userIds) {
      byUser.set(userId, await this.membership.effectiveRoleIds(userId, tx));
    }
    return byUser;
  }

  /** Роли одного сотрудника, добавившиеся относительно снимка «до», — только
   *  из прав актора. Вызывается ПОСЛЕ мутации: расчёт «после» делает порт. */
  async assertEffectiveRolesHeld(
    actor: AuthUser,
    userId: string,
    beforeRoleIds: readonly string[],
    tx: TransactionClient,
  ): Promise<void> {
    const after = await this.membership.effectiveRoleIds(userId, tx);
    await this.assertRolesHeld(actor, addedRoleIds(beforeRoleIds, after), tx);
  }

  /** То же для группы затронутых сотрудников (перенос подразделения — всё
   *  поддерево): запрещены роли, добавившиеся любому из них. */
  async assertNoEscalationForUsers(
    actor: AuthUser,
    userIds: readonly string[],
    beforeByIds: ReadonlyMap<string, string[]>,
    tx: TransactionClient,
  ): Promise<void> {
    const added = new Set<string>();
    for (const userId of userIds) {
      const after = await this.membership.effectiveRoleIds(userId, tx);
      for (const roleId of addedRoleIds(beforeByIds.get(userId) ?? [], after)) {
        added.add(roleId);
      }
    }
    await this.assertRolesHeld(actor, [...added], tx);
  }

  /** bind: каждая добавляемая роль — только из прав, которые есть у актора. */
  private async assertRolesHeld(
    actor: AuthUser,
    roleIds: readonly string[],
    tx: TransactionClient,
  ): Promise<void> {
    if (roleIds.length === 0) return;
    // Замок строк добавляемых ролей (#490, TOCTOU): права читаются ПОД замком —
    // параллельное расширение роли либо коммитится до нас (и bind честно ловит
    // 403 по новым правам), либо после нас, и ответственность за него несёт
    // прошедший свой bind тот, кто расширял. Сортировка — детерминированный
    // порядок замков: два параллельных назначения не взаимоблокируются.
    for (const roleId of [...roleIds].sort()) {
      await this.roles.lockForUpdate(roleId, tx);
    }
    const permissionsByRole = await this.roles.permissionsByIds([...roleIds], tx);
    const missing = rolesNotHeld(
      actor.permissions,
      roleIds.map((roleId) => permissionsByRole.get(roleId) ?? []),
    );
    if (missing.length > 0) {
      throw new DomainException(
        ErrorCode.ROLE_PERMISSION_NOT_HELD,
        'Permissions are not held by actor',
        { permissions: missing },
      );
    }
  }
}
