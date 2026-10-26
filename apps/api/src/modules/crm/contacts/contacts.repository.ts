import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';

const contactSelect = {
  id: true,
  fullName: true,
  position: true,
  email: true,
  phone: true,
  archivedAt: true,
} as const;

export type ContactPersonRow = Prisma.ContactPersonGetPayload<{ select: typeof contactSelect }>;

export interface ContactPersonWriteData {
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
}

/** Доступ к таблице contact_persons (контактные лица контрагентов). */
@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Контакты контрагента: действующие по ФИО, затем архивные (карточка). */
  findByCounterparty(counterpartyId: string, tx?: TransactionClient): Promise<ContactPersonRow[]> {
    const client = tx ?? this.prisma;
    return client.contactPerson.findMany({
      where: { counterpartyId },
      orderBy: [
        { archivedAt: { sort: 'asc', nulls: 'first' } },
        { fullName: 'asc' },
        { id: 'asc' },
      ],
      select: contactSelect,
    });
  }

  /** Контакт строго в границах своего контрагента (чужой id — не найден). */
  findOwned(
    counterpartyId: string,
    contactId: string,
    tx?: TransactionClient,
  ): Promise<ContactPersonRow | null> {
    const client = tx ?? this.prisma;
    return client.contactPerson.findFirst({
      where: { id: contactId, counterpartyId },
      select: contactSelect,
    });
  }

  /** Подписанты пачкой для DTO писем и истории (#55), включая архивных. */
  findRefs(
    ids: readonly string[],
  ): Promise<{ id: string; fullName: string; position: string | null }[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.contactPerson.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true, position: true },
    });
  }

  /** Действующий контакт своего контрагента — запись подписанта письма (#55). */
  findActiveRef(
    counterpartyId: string,
    contactId: string,
  ): Promise<{ id: string; fullName: string; position: string | null } | null> {
    return this.prisma.contactPerson.findFirst({
      where: { id: contactId, counterpartyId, archivedAt: null },
      select: { id: true, fullName: true, position: true },
    });
  }

  /** Счётчики активных контактов пачкой по id страницы реестра. */
  async countActiveByCounterparties(ids: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ids.length === 0) return counts;
    const rows = await this.prisma.contactPerson.groupBy({
      by: ['counterpartyId'],
      where: { counterpartyId: { in: [...ids] }, archivedAt: null },
      _count: { _all: true },
    });
    for (const row of rows) counts.set(row.counterpartyId, row._count._all);
    return counts;
  }

  create(
    counterpartyId: string,
    data: ContactPersonWriteData,
    tx: TransactionClient,
  ): Promise<ContactPersonRow> {
    return tx.contactPerson.create({
      data: { counterpartyId, ...data },
      select: contactSelect,
    });
  }

  update(
    id: string,
    data: Partial<ContactPersonWriteData>,
    tx: TransactionClient,
  ): Promise<ContactPersonRow> {
    return tx.contactPerson.update({ where: { id }, data, select: contactSelect });
  }

  /** Физическое удаление контактного лица (внутренняя запись карточки). */
  async delete(id: string, tx: TransactionClient): Promise<void> {
    await tx.contactPerson.delete({ where: { id } });
  }

  setArchivedAt(
    id: string,
    archivedAt: Date | null,
    tx: TransactionClient,
  ): Promise<ContactPersonRow> {
    return tx.contactPerson.update({ where: { id }, data: { archivedAt }, select: contactSelect });
  }
}
