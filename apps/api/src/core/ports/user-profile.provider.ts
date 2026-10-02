import { Injectable } from '@nestjs/common';
import type { UserRef } from '@nodus/contracts';

import { SignedUrlService } from '../crypto/signed-url.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TransactionClient } from '../database/transaction-runner.js';
import type { UserProfileReader } from './user-profile.port.js';

/** Минимум полей профиля для гидратации чужих DTO (ADR-0012). */
const userRefSelect = {
  id: true,
  displayName: true,
  avatarFileId: true,
} as const;

type UserRefRow = { id: string; displayName: string; avatarFileId: string | null };

/**
 * Реализация read-порта UserProfileReader (ADR-0012): единственное место,
 * где модуль directory отдаёт профиль наружу другим модулям. Токен
 * USER_PROFILE_READER — в провайдерах модуля-потребителя.
 * Аватар — файл-дериват (#186): в UserRef уходит подписная ссылка отдачи
 * (сущность хранит fileId; старая колонка avatar_url не используется).
 */
@Injectable()
export class UserProfileProvider implements UserProfileReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signedUrls: SignedUrlService,
  ) {}

  async findRefs(userIds: string[], tx?: TransactionClient): Promise<UserRef[]> {
    if (userIds.length === 0) return [];
    // Без фильтра статуса: деактивированные (уволенные) остаются в истории
    // сообщений/задач — их имена должны гидратироваться корректно.
    // tx — чтение по соединению транзакции отправителя (раунд 3).
    const rows = await (tx ?? this.prisma).user.findMany({
      where: { id: { in: userIds } },
      select: userRefSelect,
    });
    return rows.map((row) => this.toRef(row));
  }

  async searchByDisplayName(query: string, limit: number): Promise<UserRef[]> {
    const rows = await this.prisma.user.findMany({
      where: { displayName: { contains: query, mode: 'insensitive' }, status: 'active' },
      select: userRefSelect,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toRef(row));
  }

  async findMentionMatches(
    tokens: string[],
  ): Promise<{ ref: UserRef; displayName: string; firstName: string; lastName: string }[]> {
    if (tokens.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'active',
        OR: [
          { displayName: { in: tokens, mode: 'insensitive' } },
          { firstName: { in: tokens, mode: 'insensitive' } },
          { lastName: { in: tokens, mode: 'insensitive' } },
        ],
      },
      select: { ...userRefSelect, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      ref: this.toRef(row),
      displayName: row.displayName,
      firstName: row.firstName,
      lastName: row.lastName,
    }));
  }

  private toRef(row: UserRefRow): UserRef {
    return {
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarFileId ? this.signedUrls.fileContentUrl(row.avatarFileId) : null,
    };
  }
}
