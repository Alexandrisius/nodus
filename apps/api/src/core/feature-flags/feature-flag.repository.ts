import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import type { TransactionClient } from '../database/transaction-runner.js';

/** Доступ к таблице feature_flags (единственная точка, repository pattern). */
@Injectable()
export class FeatureFlagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEnabled(key: string, tx?: TransactionClient): Promise<boolean | null> {
    const client = tx ?? this.prisma;
    const row = await client.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });
    return row?.enabled ?? null;
  }

  /** Ключи включённых модулей (карточка `/auth/me` — клиентский гейт). */
  async findEnabledKeys(): Promise<string[]> {
    const rows = await this.prisma.featureFlag.findMany({
      select: { key: true },
      where: { enabled: true },
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => row.key);
  }

  async setEnabled(key: string, enabled: boolean): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
  }
}
