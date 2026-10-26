import type { InjectionToken } from '@nestjs/common';
import type { Permission } from '@nodus/contracts';

import type { TransactionClient } from '../database/transaction-runner.js';

/**
 * Порт расчёта ролей и прав сотрудника (ADR-0012, ADR-0034 п. 4) — с #379
 * ЕДИНСТВЕННЫЙ источник прав для входа, refresh и `/auth/me`. Состав:
 * прямые роли (`user_roles`) ∪ роли, привязанные к управленческому
 * подразделению сотрудника и всем его предкам (`department_roles`).
 * Юридическая структура не участвует, привязка архивного подразделения прав
 * не даёт. Потребители: auth (`identity.loader.ts`), далее #432 и #382.
 */
export interface RoleMembershipReader {
  /** Прямые роли ∪ роли подразделения и его предков. */
  effectiveRoleIds(userId: string, tx?: TransactionClient): Promise<string[]>;

  /** Объединение прав этих ролей — только значения каталога `Permission`, по алфавиту. */
  effectivePermissions(userId: string, tx?: TransactionClient): Promise<Permission[]>;
}

export const ROLE_MEMBERSHIP_READER: InjectionToken = 'ROLE_MEMBERSHIP_READER';
