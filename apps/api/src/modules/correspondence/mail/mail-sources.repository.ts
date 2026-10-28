import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/** Ключ advisory-лока цикла приёма: второй процесс api приём не ведёт
 *  (страховка горизонтального масштабирования — само оно для приёма
 *  запрещено, ADR-0035). */
export const MAIL_SYNC_ADVISORY_LOCK = 9056n;

/**
 * Репозиторий ящиков-источников (mail_sources, #56): курсор UIDVALIDITY/UID и
 * аккумуляторы цикла. Единственная точка доступа к таблице (patterns.md);
 * сервис приёма не знает про PrismaService.
 */
@Injectable()
export class MailSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCode(code: string) {
    return this.prisma.mailSource.findUnique({ where: { code } });
  }

  /** Строка ящика создаётся лениво, если сид миграции не нашёл. */
  async ensure(code: string) {
    return (await this.findByCode(code)) ?? this.prisma.mailSource.create({ data: { code } });
  }

  /** Advisory lock цикла: false — приём уже ведёт другой процесс. */
  async tryLock(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${MAIL_SYNC_ADVISORY_LOCK}) AS locked`;
    return rows[0]?.locked === true;
  }

  async unlock(): Promise<void> {
    await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${MAIL_SYNC_ADVISORY_LOCK})`;
  }

  /** Первый запуск: курсор на максимум, старое не импортируем (В5). */
  initializeCursor(id: string, uidValidity: bigint, lastUid: bigint) {
    return this.prisma.mailSource.update({
      where: { id },
      data: { uidValidity, lastUid, lastSyncAt: new Date() },
    });
  }

  /** Ящик пересоздан: полный переобход под дедупом. */
  resetCursor(id: string, uidValidity: bigint) {
    return this.prisma.mailSource.update({
      where: { id },
      data: { uidValidity, lastUid: 0n },
    });
  }

  /** Курсор — той же транзакцией, что и письмо (Р3). */
  advanceCursor(tx: TransactionClient, id: string, lastUid: bigint) {
    return tx.mailSource.update({
      where: { id },
      data: { lastUid },
    });
  }

  /** Успех цикла: сброс аккумулятора неудач. */
  recordSuccess(id: string) {
    return this.prisma.mailSource.update({
      where: { id },
      data: { consecutiveFailures: 0, lastError: null, lastSyncAt: new Date() },
    });
  }

  /** Неудача цикла: +1 к аккумулятору, свежая причина. */
  recordFailure(code: string, message: string) {
    return this.prisma.mailSource.update({
      where: { code },
      data: { consecutiveFailures: { increment: 1 }, lastError: message.slice(0, 500) },
    });
  }

  markNotified(id: string) {
    return this.prisma.mailSource.update({
      where: { id },
      data: { lastNotifiedAt: new Date() },
    });
  }
}
