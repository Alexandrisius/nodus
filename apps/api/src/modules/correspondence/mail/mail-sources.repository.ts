import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/**
 * Репозиторий ящиков-источников (mail_sources, #56): курсор UIDVALIDITY/UID и
 * аккумуляторы цикла. Единственная точка доступа к таблице (patterns.md);
 * сервис приёма не знает про PrismaService. Advisory-лок цикла живёт отдельно
 * (MailSyncLock): сессионный лок требует одно и то же соединение на захват и
 * освобождение — пул Prisma этого не гарантирует.
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
