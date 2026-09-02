import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';
import { TransactionRunner } from './transaction-runner.js';

/**
 * Глобальный слой БД: PrismaService + TransactionRunner доступны всем
 * core-примитивам и модулям без явного импорта (patterns.md).
 */
@Global()
@Module({
  providers: [PrismaService, TransactionRunner],
  exports: [PrismaService, TransactionRunner],
})
export class DatabaseModule {}
