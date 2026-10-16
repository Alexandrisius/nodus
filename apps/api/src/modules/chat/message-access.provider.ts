import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { ChatMessageAccess, ChatMessageSnapshot } from './message-access.port.js';

const EXCERPT_MAX = 160;

/** Реализация read-порта доступа к сообщению (таблицы чата — только здесь). */
@Injectable()
export class MessageAccessProvider implements ChatMessageAccess {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(messageId: string, userId: string): Promise<ChatMessageSnapshot | null> {
    const rows = await this.prisma.$queryRaw<
      { id: string; conversation_id: string; title: string | null; text: string }[]
    >(Prisma.sql`
      SELECT m.id, m.conversation_id, c.title, m.text
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        AND cm.user_id = ${userId}::uuid
      WHERE m.id = ${messageId}::uuid AND m.deleted_at IS NULL AND NOT m.obliterated
    `);
    const row = rows[0];
    if (!row) return null;
    const text = row.text.trim();
    return {
      messageId: row.id,
      conversationId: row.conversation_id,
      conversationTitle: row.title,
      excerpt: text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text,
    };
  }

  async taskDiscussion(conversationId: string): Promise<{ taskId: string; count: number } | null> {
    const rows = await this.prisma.$queryRaw<{ task_id: string; count: number }[]>(Prisma.sql`
      SELECT c.task_id,
        (SELECT count(*)::int FROM messages m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND NOT m.obliterated) AS count
      FROM conversations c
      WHERE c.id = ${conversationId}::uuid AND c.type = 'task' AND c.task_id IS NOT NULL
    `);
    const row = rows[0];
    return row ? { taskId: row.task_id, count: row.count } : null;
  }
}
