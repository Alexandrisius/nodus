import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { mergePermissions } from '../permissions.js';

/**
 * Канал проекта (#52, Р8): беседа `type='project_channel'` c привязкой
 * project_id (частичный unique — арбитр гонки обработчика события и GET
 * by-project) и составом-проекцией участников проекта. Таблицы чата —
 * только здесь (I3/I6). Пост в канале — ограничен сервисом (canPost),
 * треды открыты всем участникам (модель канала новостей).
 */
@Injectable()
export class ProjectChatRepository {
  async findOrCreate(
    tx: TransactionClient,
    projectId: string,
    title: string,
    createdBy: string,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await this.find(tx, projectId);
    if (existing) return { id: existing, created: false };
    const inserted = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO conversations (id, type, project_id, title, visibility, permissions, created_by, updated_at)
      VALUES (${randomUUID()}::uuid, 'project_channel', ${projectId}::uuid, ${title}, 'closed',
              ${JSON.stringify(mergePermissions())}::jsonb, ${createdBy}::uuid, now())
      ON CONFLICT (project_id) WHERE type = 'project_channel' AND project_id IS NOT NULL DO NOTHING
      RETURNING id
    `);
    if (inserted[0]) return { id: inserted[0].id, created: true };
    const raced = await this.find(tx, projectId);
    if (!raced) throw new Error('project channel: find-or-create race lost twice');
    return { id: raced, created: false };
  }

  async find(tx: TransactionClient, projectId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations
      WHERE type = 'project_channel' AND project_id = ${projectId}::uuid LIMIT 1
    `);
    return rows[0]?.id ?? null;
  }

  /** Переименование проекта → заголовок канала «Проект: <имя>» (Р8). */
  async rename(tx: TransactionClient, conversationId: string, title: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE conversations SET title = ${title}, updated_at = now()
      WHERE id = ${conversationId}::uuid
    `);
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
    members: { userId: string; role: string }[],
  ): Promise<string[]> {
    if (members.length === 0) return [];
    const values = Prisma.join(
      members.map(
        (m) => Prisma.sql`(${conversationId}::uuid, ${m.userId}::uuid, ${m.role}, false, now())`,
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
