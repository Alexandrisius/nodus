import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { mergePermissions } from '../permissions.js';

/**
 * Беседа письма (#55, Р10): find-or-create по `letter_id` (частичный unique
 * `WHERE type='letter'` — арбитр гонки обработчика и GET by-letter) и
 * синхронизация состава с адресатом и участниками. Таблицы чата — только
 * здесь (I3/I6); строки `letters` читает порт `LETTER_CHAT_READER`.
 */
@Injectable()
export class LetterChatRepository {
  async findOrCreate(
    tx: TransactionClient,
    letterId: string,
    createdBy: string,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await this.find(tx, letterId);
    if (existing) return { id: existing, created: false };
    const inserted = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO conversations (id, type, letter_id, permissions, created_by, updated_at)
      VALUES (${randomUUID()}::uuid, 'letter', ${letterId}::uuid,
              ${JSON.stringify(mergePermissions())}::jsonb, ${createdBy}::uuid, now())
      ON CONFLICT (letter_id) WHERE type = 'letter' AND letter_id IS NOT NULL DO NOTHING
      RETURNING id
    `);
    if (inserted[0]) return { id: inserted[0].id, created: true };
    const raced = await this.find(tx, letterId);
    if (!raced) throw new Error('letter chat: find-or-create race lost twice');
    return { id: raced, created: false };
  }

  async find(tx: TransactionClient, letterId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations WHERE type = 'letter' AND letter_id = ${letterId}::uuid LIMIT 1
    `);
    return rows[0]?.id ?? null;
  }

  async members(tx: TransactionClient, conversationId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      SELECT user_id FROM conversation_members WHERE conversation_id = ${conversationId}::uuid
    `);
    return rows.map((row) => row.user_id);
  }

  async addMembers(
    tx: TransactionClient,
    conversationId: string,
    members: { userId: string; role: string; muted: boolean }[],
  ): Promise<string[]> {
    if (members.length === 0) return [];
    const values = Prisma.join(
      members.map(
        (member) =>
          Prisma.sql`(${conversationId}::uuid, ${member.userId}::uuid, ${member.role}, ${member.muted}, now())`,
      ),
      ',',
    );
    const rows = await tx.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      INSERT INTO conversation_members (conversation_id, user_id, role, muted, updated_at)
      VALUES ${values}
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      RETURNING user_id
    `);
    return rows.map((row) => row.user_id);
  }

  async removeMembers(tx: TransactionClient, conversationId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM conversation_members
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ANY(${userIds}::uuid[])
    `);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM conversation_drafts
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ANY(${userIds}::uuid[])
    `);
  }

  async lock(tx: TransactionClient, conversationId: string): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE
    `);
  }
}
