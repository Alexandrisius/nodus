import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';

/** Учётные данные для проверки пароля (passwordHash не выходит из репозитория). */
export interface UserCredentials {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: 'active' | 'deactivated';
}

/** Идентичность для AuthUser/JWT: пользователь + развёрнутые права ролей. */
export interface AuthIdentity {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'deactivated';
  permissions: string[];
}

export interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * Доступ к таблицам auth (users — только credential-часть, sessions).
 * Карточка сотрудника — репозиторий модуля directory; здесь — только то,
 * что нужно аутентификации (I3: таблицы users общие ядра, читаем минимум).
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        displayName: true,
        status: true,
      },
    });
    return user;
  }

  /** Пользователь + плоский набор прав (union прав всех ролей). */
  async findIdentityById(id: string): Promise<AuthIdentity | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        roles: { select: { role: { select: { permissions: { select: { permission: true } } } } } },
      },
    });
    if (!user) return null;
    const permissions = [
      ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission))),
    ];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      permissions,
    };
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async createSession(
    data: {
      userId: string;
      refreshTokenHash: string;
      userAgent: string | null;
      ip: string | null;
      expiresAt: Date;
    },
    tx?: TransactionClient,
  ): Promise<SessionRow> {
    const client = tx ?? this.prisma;
    return client.session.create({ data });
  }

  async findSessionById(id: string): Promise<SessionRow | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  /** Ротация: предыдущий хэш ← текущий, текущий ← новый; скользящий expiresAt. */
  async rotateSession(
    id: string,
    newHash: string,
    currentHash: string,
    expiresAt: Date,
    tx?: TransactionClient,
  ): Promise<SessionRow> {
    const client = tx ?? this.prisma;
    return client.session.update({
      where: { id },
      data: {
        previousRefreshTokenHash: currentHash,
        refreshTokenHash: newHash,
        expiresAt,
      },
    });
  }

  async revokeSession(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.session.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Отзыв всех активных сессий пользователя (кроме exceptId — текущей). */
  async revokeAllSessions(
    userId: string,
    exceptId?: string,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  /** Активные сессии пользователя для списка «Мои сессии». */
  async listActiveSessions(userId: string): Promise<SessionRow[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
