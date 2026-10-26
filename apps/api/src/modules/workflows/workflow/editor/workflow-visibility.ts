import {
  ErrorCode,
  normalizeTypeConfig,
  Permission,
  typeAccessFor,
  type AuthUser,
} from '@nodus/contracts';

import { DomainException } from '../../../../core/errors/domain-exception.js';
import type { RoleMembershipReader } from '../../../../core/ports/role-membership.port.js';
import type { ProcessTypesRepository } from '../../types/process-types.repository.js';
import { typeSubjectOf } from '../../types/type-subject.js';

/**
 * Видимость маршрута для читателя (#432, security-ревью): документ маршрута
 * открыт всем вошедшим (решение владельца — схемы видят все), но у маршрута
 * скрытого типа в нём теперь есть данные, привязанные к типу: форма создания
 * со скрытыми значениями. Смотрящий без `workflow.manage` получает 404, если
 * не видит НИ ОДНОГО типа маршрута, — существование скрытого типа не
 * подтверждается. Маршрут без типов (сирота) читается как раньше.
 */
export async function assertWorkflowVisible(
  types: ProcessTypesRepository,
  membership: RoleMembershipReader,
  typeIds: readonly string[],
  user: Pick<AuthUser, 'id' | 'permissions'>,
): Promise<void> {
  if (typeIds.length === 0) return;
  if (user.permissions.includes(Permission.WORKFLOW_MANAGE)) return;
  const [subject, rows] = await Promise.all([
    typeSubjectOf(membership, user.id),
    types.findByIds(typeIds),
  ]);
  const visible = rows.some(
    (row) =>
      typeAccessFor({ config: normalizeTypeConfig(row.config), creatable: row.creatable }, subject)
        .canView,
  );
  if (!visible) throw new DomainException(ErrorCode.NOT_FOUND, 'Workflow not found');
}
