import { Injectable } from '@nestjs/common';
import type { UserRef } from '@nodus/contracts';

import { PrismaService } from '../database/prisma.service.js';
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

  async findRefs(userIds: string[]): Promise<UserRef[]> {
    if (userIds.length === 0) return [];
    // Без фильтра статуса: деактивированные (уволенные) остаются в истории
    // сообщений/задач — их имена должны гидратироваться корректно.
    const rows = await this.prisma.user.findMany({
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
}
