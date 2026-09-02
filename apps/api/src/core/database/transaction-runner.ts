import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

/** Транзакционный клиент, пробрасываемый в репозитории и EventBus. */
export type TransactionClient = Prisma.TransactionClient;

/**
 * Канон транзакций (patterns.md): сервис вызывает
 * `this.txRunner.run(async (tx) => …)`, tx передаётся в репозиторий
 * и `eventBus.emit(tx, …)`.
 */
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  /** Выполняет fn в интерактивной транзакции с таймаутом (защита от зависших tx). */
  run<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 10_000 });
  }
}
