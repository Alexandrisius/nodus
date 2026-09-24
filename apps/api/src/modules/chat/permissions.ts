import {
  conversationPermissionsSchema,
  type ConversationMemberRole,
  type ConversationPermissions,
} from '@nodus/contracts';

/** Действия матрицы прав беседы (контракт conversationPermissionsSchema). */
export type ConversationAction = keyof ConversationPermissions;

/** Иерархия ролей: выше ранг — больше прав. */
const ROLE_RANK: Record<ConversationMemberRole, number> = { member: 0, admin: 1, owner: 2 };

/** Дефолты сервера (контракт): changeInfo=admin, addMembers=member, ... */
export const DEFAULT_CONVERSATION_PERMISSIONS: ConversationPermissions = {
  changeInfo: 'admin',
  addMembers: 'member',
  removeMembers: 'admin',
  post: 'member',
  manageSettings: 'owner',
};

/** Частичная матрица создания → полная (недостающее — дефолты). */
export function mergePermissions(
  partial?: Partial<ConversationPermissions>,
): ConversationPermissions {
  return conversationPermissionsSchema.parse({
    ...DEFAULT_CONVERSATION_PERMISSIONS,
    ...partial,
  });
}

/** Роль удовлетворяет требованию матрицы (ранг роли ≥ требуемого ранга). */
export function roleSatisfies(
  role: ConversationMemberRole,
  required: ConversationMemberRole,
): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Может ли роль совершить действие по матрице беседы. */
export function can(
  role: ConversationMemberRole,
  matrix: ConversationPermissions,
  action: ConversationAction,
): boolean {
  return roleSatisfies(role, matrix[action]);
}

/** Парсер матрицы из JSONB беседы (защита от мусора в БД → дефолты). */
export function parsePermissions(raw: unknown): ConversationPermissions {
  const result = conversationPermissionsSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_CONVERSATION_PERMISSIONS;
}
