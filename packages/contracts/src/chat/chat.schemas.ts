import { z } from 'zod';

import { userRefSchema } from '../directory/user-ref.schema.js';
import { projectRefSchema } from '../tasks/task.schemas.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/** Контракты модуля чата (chat.Conversation/Message). */

export const conversationTypeSchema = z.enum(['direct', 'group', 'project_channel']);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export const messageAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  size: z.number().int().min(0),
  mime: z.string().min(1),
});

export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const messageReactionSchema = z.object({
  emoji: z.string().min(1),
  count: z.number().int().min(1),
  mine: z.boolean(),
});

export type MessageReaction = z.infer<typeof messageReactionSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  author: userRefSchema,
  text: z.string(),
  replyToId: z.uuid().nullable(),
  /** Треды ровно одного уровня: ответы ссылаются на корневое сообщение. */
  threadRootId: z.uuid().nullable(),
  threadRepliesCount: z.number().int().min(0),
  reactions: z.array(messageReactionSchema),
  attachments: z.array(messageAttachmentSchema),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type ChatMessage = z.infer<typeof messageSchema>;

export const conversationListItemSchema = z.object({
  id: z.uuid(),
  type: conversationTypeSchema,
  /** Для direct — вычисляется из имён участников на клиенте/сервере. */
  title: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  project: projectRefSchema.nullable(),
  membersPreview: z.array(userRefSchema),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().min(0),
});

export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

export const listConversationsQuerySchema = cursorQuerySchema.extend({
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listMessagesQuerySchema = cursorQuerySchema;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
