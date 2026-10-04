import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';

/** Политика «важного сообщения» (#100, вердикт 30.09): доступно всем,
 *  дисциплину даёт лимит — не иерархия. Чистая функция (юнит-покрыта). */
export interface UrgentSendInput {
  conversationType: string;
  memberCount: number;
  /** Срочные отправителя за скользящие сутки (repo.countUrgentSentSince). */
  sentToday: number;
  dailyLimit: number;
  groupMax: number;
}

/** Бросает DomainException, если отправка срочного запрещена (I8 — бэкенд). */
export function assertUrgentSendAllowed(input: UrgentSendInput): void {
  if (input.conversationType !== 'direct' && input.memberCount > input.groupMax) {
    throw new DomainException(
      ErrorCode.CHAT_URGENT_GROUP_TOO_LARGE,
      'Urgent messages are not allowed in conversations over the member limit',
    );
  }
  if (input.sentToday >= input.dailyLimit) {
    throw new DomainException(
      ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED,
      'Urgent message daily limit exceeded',
    );
  }
}

/** Затратные части гейта (запросы + env) собраны здесь, чтобы send остался
 *  линейным: счётчики передаются замыканиями в tx отправки (#100, #177). */
export async function assertUrgentSendAllowedBy(deps: {
  conversationType: string;
  countMembers: () => Promise<number>;
  countUrgentSent: () => Promise<number>;
}): Promise<void> {
  const memberCount = deps.conversationType === 'direct' ? 0 : await deps.countMembers();
  const sentToday = await deps.countUrgentSent();
  assertUrgentSendAllowed({
    conversationType: deps.conversationType,
    memberCount,
    sentToday,
    dailyLimit: Number(process.env.NOTIFY_URGENT_DAILY_LIMIT ?? 3),
    groupMax: Number(process.env.NOTIFY_URGENT_GROUP_MAX ?? 20),
  });
}
