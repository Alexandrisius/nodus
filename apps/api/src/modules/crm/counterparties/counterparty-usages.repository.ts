import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/** Использование контрагента письмом (#55, B6): кто и какой подписант. */
export interface LetterUsage {
  sourceId: string;
  counterpartyId: string;
  contactId: string | null;
}

/**
 * Проекция «кто ссылается на контрагента» (#55, ADR-0033 п.3): строки
 * `counterparty_usages` по письмам пишет обработчик событий корреспонденции.
 * Счётчики карточки читает `CounterpartiesRepository` (та же таблица —
 * владелец crm, I3/I6).
 */
@Injectable()
export class CounterpartyUsagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Письмо зарегистрировано/переписано: строка проекции upsert-ом. */
  async upsertLetter(usage: LetterUsage): Promise<void> {
    await this.prisma.counterpartyUsage.upsert({
      where: { sourceKind_sourceId: { sourceKind: 'letter', sourceId: usage.sourceId } },
      update: {
        counterpartyId: usage.counterpartyId,
        contactId: usage.contactId,
        updatedAt: new Date(),
      },
      create: {
        sourceKind: 'letter',
        sourceId: usage.sourceId,
        counterpartyId: usage.counterpartyId,
        contactId: usage.contactId,
      },
    });
  }

  /** Правка только подписанта: корреспондент строки не меняется. */
  async updateLetterContact(sourceId: string, contactId: string | null): Promise<void> {
    await this.prisma.counterpartyUsage.updateMany({
      where: { sourceKind: 'letter', sourceId },
      data: { contactId, updatedAt: new Date() },
    });
  }

  /** Письмо удалено (спам): строки проекции нет. */
  async deleteLetter(sourceId: string): Promise<void> {
    await this.prisma.counterpartyUsage.deleteMany({
      where: { sourceKind: 'letter', sourceId },
    });
  }

  /** Подписант используется письмами — удаление контакта запрещено. */
  async contactInUse(contactId: string): Promise<boolean> {
    const row = await this.prisma.counterpartyUsage.findFirst({
      where: { contactId },
      select: { contactId: true },
    });
    return row !== null;
  }

  /** Для тестов и фоновой сверки: строка использования письма. */
  findLetter(sourceId: string, tx?: TransactionClient) {
    return (tx ?? this.prisma).counterpartyUsage.findUnique({
      where: { sourceKind_sourceId: { sourceKind: 'letter', sourceId } },
      select: { counterpartyId: true, contactId: true },
    });
  }
}
