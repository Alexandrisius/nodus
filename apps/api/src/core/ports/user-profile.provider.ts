import { Injectable } from '@nestjs/common';
import type { UserRef } from '@nodus/contracts';

import { PrismaService } from '../database/prisma.service.js';
import type { TransactionClient } from '../database/transaction-runner.js';
import type { UserProfileReader } from './user-profile.port.js';

/** Минимум полей профиля для гидратации чужих DTO (ADR-0012). */
const userRefSelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
} as const;

type UserRefRow = { id: string; displayName: string; avatarUrl: string | null };

function toRef(row: UserRefRow): UserRef {
  return { id: row.id, displayName: row.displayName, avatarUrl: row.avatarUrl };
}

/**
 * Реализация read-порта UserProfileReader (ADR-0012): единственное место,
 * где модуль directory отдаёт профиль наружу другим модулям. Токен
 * USER_PROFILE_READER — в провайдерах directory-модуля.
 */
@Injectable()
export class UserProfileProvider implements UserProfileReader {
  constructor(private readonly prisma: PrismaService) {}

  async findRefs(userIds: string[], tx?: TransactionClient): Promise<UserRef[]> {
    if (userIds.length === 0) return [];
    // Без фильтра статуса: деактивированные (уволенные) остаются в истории
    // сообщений/задач — их имена должны гидратироваться корректно.
    // tx — чтение по соединению транзакции отправителя (раунд 3).
    const rows = await (tx ?? this.prisma).user.findMany({
      where: { id: { in: userIds } },
      select: userRefSelect,
    });
    return rows.map(toRef);
  }

  async searchByDisplayName(query: string, limit: number): Promise<UserRef[]> {
    const rows = await this.prisma.user.findMany({
      where: { displayName: { contains: query, mode: 'insensitive' }, status: 'active' },
      select: userRefSelect,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRef);
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
      ref: toRef(row),
      displayName: row.displayName,
      firstName: row.firstName,
      lastName: row.lastName,
    }));
  }
}
