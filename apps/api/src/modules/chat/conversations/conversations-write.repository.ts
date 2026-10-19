import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { ConversationPermissions } from '@nodus/contracts';
import { mergePermissions } from '../permissions.js';

/**
 * Запись агрегата Conversation: создание (find-or-create direct с
 * гонкоустойчивостью, группа/канал), атрибуты беседы (название, аватар),
 * лок строки беседы для мутаций состава. Выделено из ConversationsRepository
 * (I5: файл агрегата перерос 500 строк).
 */
@Injectable()
export class ConversationsWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: TransactionClient): PrismaService | TransactionClient {
    return tx ?? this.prisma;
  }

  /**
   * Find-or-create direct: нормализованная пара (user_min <= user_max, равны
   * у «Заметок») + частичный уникальный индекс. Гонку закрывает ON CONFLICT:
   * INSERT ждёт конкурента, при его коммите возвращает 0 строк → повторный
   * SELECT. Advisory-локи не нужны (уникальный индекс — арбитр).
   */
  async findOrCreateDirect(
    userId: string,
    peerId: string,
    tx?: TransactionClient,
    allowCreate = true,
  ): Promise<{ id: string; created: boolean } | null> {
    const client = this.client(tx);
    const userMin = userId < peerId ? userId : peerId;
    const userMax = userId < peerId ? peerId : userId;
    const existing = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations
      WHERE type = 'direct' AND user_min = ${userMin}::uuid AND user_max = ${userMax}::uuid
      LIMIT 1
    `);
    if (existing[0]) return { id: existing[0].id, created: false };
    if (!allowCreate) return null;

    const permissions = mergePermissions();
    const inserted = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO conversations (id, type, permissions, created_by, user_min, user_max, updated_at)
      VALUES (${randomUUID()}::uuid, 'direct', ${JSON.stringify(permissions)}::jsonb,
              ${userId}::uuid, ${userMin}::uuid, ${userMax}::uuid, now())
      ON CONFLICT (user_min, user_max) WHERE type = 'direct' DO NOTHING
      RETURNING id
    `);
    if (inserted[0]) {
      await this.addDirectMembers(inserted[0].id, userMin, userMax, client);
      return { id: inserted[0].id, created: true };
    }
    // Конкурент выиграл-insert: повторный SELECT видит его коммит (READ COMMITTED).
    const raced = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM conversations
      WHERE type = 'direct' AND user_min = ${userMin}::uuid AND user_max = ${userMax}::uuid
      LIMIT 1
    `);
    if (!raced[0]) {
      // Обе ветки пусты: конкурент откатился между INSERT и SELECT — повторяем вставку.
      const retry = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO conversations (id, type, permissions, created_by, user_min, user_max, updated_at)
        VALUES (${randomUUID()}::uuid, 'direct', ${JSON.stringify(permissions)}::jsonb,
                ${userId}::uuid, ${userMin}::uuid, ${userMax}::uuid, now())
        ON CONFLICT (user_min, user_max) WHERE type = 'direct' DO NOTHING
        RETURNING id
      `);
      if (!retry[0]) throw new Error('find-or-create direct: unexpected double race');
      await this.addDirectMembers(retry[0].id, userMin, userMax, client);
      return { id: retry[0].id, created: true };
    }
    return { id: raced[0].id, created: false };
  }

  private async addDirectMembers(
    conversationId: string,
    userMin: string,
    userMax: string,
    client: PrismaService | TransactionClient,
  ): Promise<void> {
    const role = 'member';
    await client.$executeRaw(Prisma.sql`
      INSERT INTO conversation_members (conversation_id, user_id, role, updated_at)
      VALUES (${conversationId}::uuid, ${userMin}::uuid, ${role}, now()),
             (${conversationId}::uuid, ${userMax}::uuid, ${role}, now())
      ON CONFLICT DO NOTHING
    `);
  }

  /** Создание группы/канала: создатель — owner, участники — member. */
  async createGroup(
    input: {
      type: 'group' | 'project_channel';
      title: string;
      description: string | null;
      visibility: string | null;
      permissions: ConversationPermissions;
      createdBy: string;
      memberIds: string[];
    },
    tx?: TransactionClient,
  ): Promise<string> {
    const client = this.client(tx);
    const id = randomUUID();
    await client.conversation.create({
      data: {
        id,
        type: input.type,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        permissions: input.permissions as Prisma.InputJsonValue,
        createdBy: input.createdBy,
        members: {
          create: [
            { userId: input.createdBy, role: 'owner' },
            ...input.memberIds.map((userId) => ({ userId, role: 'member' })),
          ],
        },
      },
      select: { id: true },
    });
    return id;
  }

  /** Блокировка строки беседы (только внутри tx): сериализует конкурирующие
   *  мутации состава — перечёт лимита под локом точен (TOCTOU add, #195). */
  async lockConversation(conversationId: string, tx: TransactionClient): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE
    `);
  }

  /** Переименование (право changeInfo, #186); 0 строк — беседы нет. */
  async updateTitle(
    conversationId: string,
    title: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const client = this.client(tx);
    const count = await client.$executeRaw(Prisma.sql`
      UPDATE conversations SET title = ${title}, updated_at = now()
      WHERE id = ${conversationId}::uuid
    `);
    return count > 0;
  }

  /** Аватар беседы: fileId деривата или null («убрать», #186). */
  async updateAvatar(
    conversationId: string,
    fileId: string | null,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const client = this.client(tx);
    const count = await client.$executeRaw(Prisma.sql`
      UPDATE conversations SET avatar_file_id = ${fileId}::uuid, updated_at = now()
      WHERE id = ${conversationId}::uuid
    `);
    return count > 0;
  }
}
