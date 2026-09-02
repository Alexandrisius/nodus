import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Единственная точка создания PrismaClient (Prisma 7 + driver adapter pg).
 * Канон: используется только в `*.repository.ts` модулей, `infra/` и
 * `TransactionRunner` — нигде больше (patterns.md).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      // Дублирует validateEnv для тестов, где сервис создаётся напрямую.
      throw new Error('DATABASE_URL не задан');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
