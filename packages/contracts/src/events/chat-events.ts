import { z } from 'zod';

/**
 * Каталог доменных событий модуля chat (I9: каждое событие — в `events`
 * через outbox; префикс = модуль-владелец в ед. числе; каталог только
 * расширяется — api-conventions.md). Payload минимальный и клиентски видим
 * (будущий WS-fanout рассылает те же события — секретов и внутренних полей
 * в payload не держать).
 */
export const CHAT_EVENTS = {
  CONVERSATION_CREATED: 'chat.conversation_created',
  MEMBER_ADDED: 'chat.member_added',
  MESSAGE_SENT: 'chat.message_sent',
  MESSAGE_EDITED: 'chat.message_edited',
  MESSAGE_DELETED: 'chat.message_deleted',
  MESSAGE_READ: 'chat.message_read',
  MESSAGE_PINNED: 'chat.message_pinned',
  MESSAGE_UNPINNED: 'chat.message_unpinned',
  REACTION_ADDED: 'chat.reaction_added',
  REACTION_REMOVED: 'chat.reaction_removed',
  THREAD_CREATED: 'chat.thread_created',
} as const;

export const chatConversationCreatedPayloadSchema = z.object({
  conversationId: z.uuid(),
  type: z.enum(['direct', 'group', 'project_channel', 'task', 'letter']),
  title: z.string().nullable(),
  createdBy: z.uuid(),
  /** Первичные участники (включая создателя). */
  memberIds: z.array(z.uuid()),
});
export type ChatConversationCreatedPayload = z.infer<typeof chatConversationCreatedPayloadSchema>;

export const chatMemberAddedPayloadSchema = z.object({
  conversationId: z.uuid(),
  userIds: z.array(z.uuid()),
  role: z.enum(['owner', 'admin', 'member']),
});
export type ChatMemberAddedPayload = z.infer<typeof chatMemberAddedPayloadSchema>;

export const chatMessageSentPayloadSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  /** Порядковый номер в беседе (курсор подписчиков: seq > lastSeen). */
  seq: z.number().int().min(1),
  authorId: z.uuid(),
  /** Ответ в треде — корень треда; null — корневое сообщение ленты. */
  threadRootId: z.uuid().nullable(),
  /** Копия пересылки (атрибуция — в сообщении, не в событии). */
  forwarded: z.boolean(),
});
export type ChatMessageSentPayload = z.infer<typeof chatMessageSentPayloadSchema>;

export const chatMessageEditedPayloadSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  editedAt: z.iso.datetime(),
});
export type ChatMessageEditedPayload = z.infer<typeof chatMessageEditedPayloadSchema>;

export const chatMessageDeletedPayloadSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  /** true — бесследно (исчезло из выдач); false — надгробие. */
  obliterated: z.boolean(),
});
export type ChatMessageDeletedPayload = z.infer<typeof chatMessageDeletedPayloadSchema>;

/** Курсор прочтения участника продвинутся (якорь догрузки read-галочек). */
export const chatMessageReadPayloadSchema = z.object({
  conversationId: z.uuid(),
  userId: z.uuid(),
  upToSeq: z.number().int().min(0),
  readAt: z.iso.datetime(),
});
export type ChatMessageReadPayload = z.infer<typeof chatMessageReadPayloadSchema>;

export const chatMessagePinnedPayloadSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  pinnedBy: z.uuid(),
});
export type ChatMessagePinnedPayload = z.infer<typeof chatMessagePinnedPayloadSchema>;

export const chatMessageUnpinnedPayloadSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  unpinnedBy: z.uuid(),
});
export type ChatMessageUnpinnedPayload = z.infer<typeof chatMessageUnpinnedPayloadSchema>;

export const chatReactionPayloadSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  emoji: z.string().min(1),
  userId: z.uuid(),
});
export type ChatReactionPayload = z.infer<typeof chatReactionPayloadSchema>;

export const chatThreadCreatedPayloadSchema = z.object({
  conversationId: z.uuid(),
  /** Корневое сообщение, вокруг которого возник тред. */
  threadRootId: z.uuid(),
  /** Первый ответ, создавший тред. */
  messageId: z.uuid(),
});
export type ChatThreadCreatedPayload = z.infer<typeof chatThreadCreatedPayloadSchema>;
