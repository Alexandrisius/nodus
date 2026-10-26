import { Injectable } from '@nestjs/common';
import type { LetterBox } from '@nodus/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import {
  letterAttachmentSelect,
  letterDetailSelect,
  letterListSelect,
  type LetterAttachmentRow,
  type LetterCursor,
  type LetterDetailRow,
  type LetterListRow,
} from './letter-row.js';

/** Ось списка: «Новые» — по поступлению, остальные — по регистрации. */
export function listOrderOf(box: LetterBox | undefined): 'receivedAt' | 'registeredAt' {
  return box === 'new' ? 'receivedAt' : 'registeredAt';
}

/**
 * Единственная точка доступа к таблицам модуля (#55): `letters`,
 * `letter_attachments`, `letter_participants`. Чтения — вне транзакций,
 * записи — в транзакции вызывающего (переход движка, создание, правка).
 */
@Injectable()
export class LettersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Страница реестра keyset по (ось, id) DESC +1 строка — признак следующей. */
  list(
    where: Prisma.LetterWhereInput,
    order: 'receivedAt' | 'registeredAt',
    after: LetterCursor | undefined,
    limit: number,
  ): Promise<LetterListRow[]> {
    const cursorWhere = after
      ? {
          OR: [
            { [order]: { lt: new Date(after.at) } },
            { [order]: new Date(after.at), id: { lt: after.id } },
          ],
        }
      : {};
    return this.prisma.letter.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ [order]: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: letterListSelect,
    });
  }

  findDetail(where: Prisma.LetterWhereInput): Promise<LetterDetailRow | null> {
    return this.prisma.letter.findFirst({ where, select: letterDetailSelect });
  }

  findDetailById(id: string, tx?: TransactionClient): Promise<LetterDetailRow | null> {
    return (tx ?? this.prisma).letter.findUnique({ where: { id }, select: letterDetailSelect });
  }

  /** Блокировка строки письма на транзакцию перехода (сериализация). */
  async lock(tx: TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM letters WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /** Участники пачкой по письмам страницы. */
  participantsOf(letterIds: readonly string[]): Promise<{ letterId: string; userId: string }[]> {
    if (letterIds.length === 0) return Promise.resolve([]);
    return this.prisma.letterParticipant.findMany({
      where: { letterId: { in: [...letterIds] } },
      select: { letterId: true, userId: true },
    });
  }

  /** Участники одного письма (деталь, состав чата). */
  participants(letterId: string): Promise<{ userId: string; role: string }[]> {
    return this.prisma.letterParticipant.findMany({
      where: { letterId },
      select: { userId: true, role: true },
    });
  }

  /** Число файлов письма по роли `source` исключено (контракт DTO). */
  async attachmentCounts(letterIds: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (letterIds.length === 0) return counts;
    const rows = await this.prisma.letterAttachment.groupBy({
      by: ['letterId'],
      where: { letterId: { in: [...letterIds] }, role: { not: 'source' } },
      _count: { _all: true },
    });
    for (const row of rows) counts.set(row.letterId, row._count._all);
    return counts;
  }

  attachments(letterId: string, tx?: TransactionClient): Promise<LetterAttachmentRow[]> {
    return (tx ?? this.prisma).letterAttachment.findMany({
      where: { letterId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: letterAttachmentSelect,
    });
  }

  create(tx: TransactionClient, data: Prisma.LetterUncheckedCreateInput) {
    return tx.letter.create({ data });
  }

  async update(
    tx: TransactionClient,
    id: string,
    data: Prisma.LetterUncheckedUpdateInput,
  ): Promise<void> {
    await tx.letter.update({ where: { id }, data });
  }

  async delete(tx: TransactionClient, id: string): Promise<void> {
    await tx.letter.delete({ where: { id } });
  }

  /** Письма, в которых лежит файл, — видимость для контрибьютора прав
   *  файлов (#55, B5). Файл может быть приложен к нескольким письмам. */
  async visibilityByFile(fileId: string): Promise<{ registeredAt: Date | null }[]> {
    const rows = await this.prisma.letterAttachment.findMany({
      where: { fileId },
      select: { letter: { select: { registeredAt: true } } },
    });
    return rows.map((row) => row.letter);
  }

  /** Файлы письма для удаления объектов хранилища (спам, Р12). */
  fileIds(letterId: string): Promise<string[]> {
    return this.prisma.letterAttachment
      .findMany({ where: { letterId }, select: { fileId: true } })
      .then((rows) => rows.map((row) => row.fileId));
  }

  /** Присоединение к обсуждению — идемпотентно (PK письмо+сотрудник). */
  async addParticipant(tx: TransactionClient, letterId: string, userId: string): Promise<boolean> {
    const existing = await tx.letterParticipant.findUnique({
      where: { letterId_userId: { letterId, userId } },
      select: { userId: true },
    });
    if (existing) return false;
    await tx.letterParticipant.create({ data: { letterId, userId } });
    return true;
  }

  /** Состав чата: адресат + участники (регистратор в чат не входит — В2). */
  async chatRoster(
    letterId: string,
  ): Promise<{ addresseeId: string | null; registeredAt: Date | null } | null> {
    return this.prisma.letter.findUnique({
      where: { id: letterId },
      select: { addresseeId: true, registeredAt: true },
    });
  }

  /** Ссылки на письма пачкой (чат, превью). */
  refs(ids: readonly string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.letter.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, regNumber: true, subject: true },
    });
  }

  /** Счётчики стадий (диалог публикации, мета списка). */
  async countByStages(stageIds: readonly string[]): Promise<Record<string, number>> {
    if (stageIds.length === 0) return {};
    const rows = await this.prisma.letter.groupBy({
      by: ['stageId'],
      where: { stageId: { in: [...stageIds] } },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.stageId] = row._count._all;
    return counts;
  }

  /** Пачка писем стадии для фонового переноса (keyset по id). */
  byStagePage(stageId: string, afterId: string | null, limit: number) {
    return this.prisma.letter.findMany({
      where: { stageId, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, workflowId: true },
    });
  }

  async moveToStage(tx: TransactionClient, id: string, stageId: string, systemState: string) {
    await tx.letter.update({
      where: { id },
      data: { stageId, systemState, stateChangedAt: new Date() },
    });
  }

  async restateStage(stageId: string, systemState: string): Promise<number> {
    const result = await this.prisma.letter.updateMany({
      where: { stageId, systemState: { not: systemState } },
      data: { systemState, stateChangedAt: new Date() },
    });
    return result.count;
  }
}
