import { ErrorCode, type ConversationMemberRole } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { can, parsePermissions, type ConversationAction } from '../permissions.js';
import type { ConversationsRepository } from './conversations.repository.js';

/**
 * Гвард действия матрицы прав беседы (#186, I8): членство и матрица —
 * данные репозитория (не request-scope); не-член и несуществующая беседа
 * неотличимы (404 — не палить наличие), член без права — 403.
 * restrictTypes — типы, где действие вообще имеет смысл (переименование и
 * аватар — только группы/каналы: у direct/task/letter название производное).
 */
export async function requireConversationAction(
  repo: ConversationsRepository,
  conversationId: string,
  userId: string,
  action: ConversationAction,
  restrictTypes?: Array<'group' | 'project_channel'>,
): Promise<void> {
  const membership = await repo.findMembership(conversationId, userId);
  if (!membership) throw DomainException.notFound('Conversation not found');
  const conv = await repo.findTypeAndPermissions(conversationId);
  if (!conv) throw DomainException.notFound('Conversation not found');
  if (restrictTypes && !restrictTypes.includes(conv.type as 'group' | 'project_channel')) {
    throw new DomainException(
      ErrorCode.VALIDATION_FAILED,
      `Action ${action} is not supported for conversation type ${conv.type}`,
    );
  }
  const allowed = can(
    membership.role as ConversationMemberRole,
    parsePermissions(conv.permissions),
    action,
  );
  if (!allowed) {
    throw DomainException.forbidden(`No permission to ${action}`);
  }
}
