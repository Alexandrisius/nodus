import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/**
 * Запись участия в беседах (`conversation_members`): персональные настройки
 * списка, гашение snooze/hidden активностью, состав (добавление, роль,
 * исключение). Чтение участия — ConversationsRepository. Выделено из
 * ConversationsRepository (I5: файл агрегата перерос 500 строк).
 */
@Injectable()
export class ConversationMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient): PrismaService | TransactionClient {
    return tx ?? this.prisma;
  }

  /** Персьональные настройки списка (pinned/muted/snoozed/hidden). */
  async updateMemberSettings(
    conversationId: string,
    userId: string,
    patch: { pinned?: boolean; muted?: boolean; snoozed?: boolean; hidden?: boolean },
    tx?: TransactionClient,
  ): Promise<void> {
    const client = this.client(tx);
    const sets: Prisma.Sql[] = [];
    if (patch.pinned !== undefined) sets.push(Prisma.sql`pinned = ${patch.pinned}`);
    if (patch.muted !== undefined) sets.push(Prisma.sql`muted = ${patch.muted}`);
    if (patch.snoozed !== undefined) sets.push(Prisma.sql`snoozed = ${patch.snoozed}`);
    if (patch.hidden !== undefined) sets.push(Prisma.sql`hidden = ${patch.hidden}`);
    if (sets.length === 0) return;
    await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET ${Prisma.join(sets, ', ')}, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    `);
  }

  /** Гашение snoozed при своей отправке/пересылке (мок-семантика). */
  async unsnooze(conversationId: string, userId: string, tx?: TransactionClient): Promise<void> {
    const client = this.client(tx);
    await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET snoozed = false, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid AND snoozed
    `);
  }

  /**
   * Активность раскрывает беседу у ВСЕХ скрывших её участников (модель
   * Битрикс24, #103): чужая/своя отправка и пересылка возвращают беседу в
   * список — скрывают только «старые» чаты, чтобы не висели сверху. Той же
   * транзакцией, что и активность; список с `hidden=false` подхватит сам.
   */
  async revealHidden(conversationId: string, tx?: TransactionClient): Promise<void> {
    const client = this.client(tx);
    await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET hidden = false, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND hidden
    `);
  }

  /** Добавление участников (#186): идемпотентно (ON CONFLICT DO NOTHING),
   *  возвращает фактически вставленные id (для события member_added). */
  async addMembers(
    conversationId: string,
    userIds: string[],
    tx?: TransactionClient,
  ): Promise<string[]> {
    const client = this.client(tx);
    if (userIds.length === 0) return [];
    const values = Prisma.join(
      userIds.map(
        (userId) => Prisma.sql`(${conversationId}::uuid, ${userId}::uuid, 'member', now())`,
      ),
      ',',
    );
    const rows = await client.$queryRaw<{ user_id: string }[]>(Prisma.sql`
      INSERT INTO conversation_members (conversation_id, user_id, role, updated_at)
      VALUES ${values}
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      RETURNING user_id
    `);
    return rows.map((row) => row.user_id);
  }

  /** Смена роли участника (модератор ⇄ участник, #186); 0 строк — не член. */
  async updateMemberRole(
    conversationId: string,
    userId: string,
    role: 'admin' | 'member',
    tx?: TransactionClient,
  ): Promise<boolean> {
    const client = this.client(tx);
    const count = await client.$executeRaw(Prisma.sql`
      UPDATE conversation_members SET role = ${role}, updated_at = now()
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    `);
    return count > 0;
  }

  /** Исключение участника (#186): строка участия + черновик (user-FK нет —
   *  чистим явно); 0 строк — не член. */
  async removeMember(
    conversationId: string,
    userId: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const client = this.client(tx);
    const count = await client.$executeRaw(Prisma.sql`
      DELETE FROM conversation_members
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    `);
    if (count === 0) return false;
    await client.$executeRaw(Prisma.sql`
      DELETE FROM conversation_drafts
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
    `);
    return true;
  }
}
