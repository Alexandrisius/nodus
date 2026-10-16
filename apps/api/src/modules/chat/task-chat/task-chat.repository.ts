import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { mergePermissions } from '../permissions.js';

/**
 * Беседа задачи (#252): find-or-create по task_id (частичный unique —
 * арбитр гонки обработчика события и GET by-task) и синхронизация состава
 * с участниками задачи. Таблицы чата — только здесь (I3/I6).
 */
@Injectable()
export class TaskChatRepository {
  async findOrCreate(
    tx: TransactionClient,
    taskId: string,
    createdBy: string,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await this.find(tx, taskId);
    if (existing) return { id: existing, created: false };
    // Состав ведёт задача: ручное добавление/исключение недоступно по типу
    // беседы (#195), матрица — дефолтная (пишут все участники).
    const inserted = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO conversations (id, type, task_id, permissions, created_by, updated_at)
      VALUES (${randomUUID()}::uuid, 'task', ${taskId}::uuid,
              ${JSON.stringify(mergePermissions())}::jsonb, ${createdBy}::uuid, now())
      ON CONFLICT (task_id) WHERE type = 'task' AND task_id IS NOT NULL DO NOTHING
      RETURNING id
    `);
    if (inserted[0]) return { id: inserted[0].id, created: true };
    const raced = await this.find(tx, taskId);
    if (!raced) throw new Error('task chat: find-or-create race lost twice');
    return { id: raced, created: false };
  }

  async find(tx: TransactionClient, taskId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations WHERE type = 'task' AND task_id = ${taskId}::uuid LIMIT 1
    `);
    return rows[0]?.id ?? null;
  }

  async members(tx: TransactionClient, conversationId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      SELECT user_id FROM conversation_members WHERE conversation_id = ${conversationId}::uuid
    `);
    return rows.map((r) => r.user_id);
  }

  async addMembers(
    tx: TransactionClient,
    conversationId: string,
    members: { userId: string; role: string; muted: boolean }[],
  ): Promise<string[]> {
    if (members.length === 0) return [];
    const values = Prisma.join(
      members.map(
        (m) =>
          Prisma.sql`(${conversationId}::uuid, ${m.userId}::uuid, ${m.role}, ${m.muted}, now())`,
      ),
      ',',
    );
    const rows = await tx.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      INSERT INTO conversation_members (conversation_id, user_id, role, muted, updated_at)
      VALUES ${values}
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      RETURNING user_id
    `);
    return rows.map((r) => r.user_id);
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
