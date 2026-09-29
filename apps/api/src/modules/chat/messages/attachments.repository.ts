import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';

/** Строка вложения (сырой ряд, camelCase). */
export interface AttachmentRow {
  id: string;
  fileId: string;
  ownerId: string;
  name: string;
  size: number;
  mime: string;
  kind: string;
  width: number | null;
  height: number | null;
  thumbFileId: string | null;
}

/**
 * Репозиторий загрузок-до-отправки (жизненный цикл message_attachments вне
 * транзакции отправки): счётчик трея композера, вставка после загрузки в
 * хранилище, отмена и ленивая уборка брошенных. Привязка к сообщению —
 * claimAttachments в messages.repository (та же транзакция, что и отправка).
 */
@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Загруженные-но-неотправленные вложения пользователя (лимит 20 — вердикт
   *  владельца 24.09; серверная сверка клиентской проверки). */
  async countUnclaimed(ownerId: string): Promise<number> {
    return this.prisma.messageAttachment.count({
      where: { ownerId, messageId: null },
    });
  }

  /** Неотправленные старше порога — кандидаты на ленивую уборку (#57):
   *  строка + объект хранилища не должны копиться вечно. */
  async findStaleUnclaimed(
    ownerId: string,
    olderThan: Date,
  ): Promise<{ id: string; fileId: string }[]> {
    return this.prisma.messageAttachment.findMany({
      where: { ownerId, messageId: null, createdAt: { lt: olderThan } },
      select: { id: true, fileId: true },
    });
  }

  async deleteUnclaimedByIds(ownerId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.messageAttachment.deleteMany({
      where: { id: { in: ids }, ownerId, messageId: null },
    });
  }

  async insertAttachment(row: {
    id: string;
    fileId: string;
    ownerId: string;
    name: string;
    size: number;
    mime: string;
    kind: string;
    width: number | null;
    height: number | null;
  }): Promise<AttachmentRow> {
    return this.prisma.messageAttachment.create({ data: row });
  }

  /** Любое вложение по id (воркер превью #150: работает и с отправленными —
   *  в отличие от findUnclaimed; null — строка удалена каскадом сообщения). */
  findAnyById(id: string): Promise<AttachmentRow | null> {
    return this.prisma.messageAttachment.findUnique({ where: { id } });
  }

  /** Фиксация превью (#150): thumbFileId + авторитетные серверные габариты
   *  (перезаписывают клиентские — сервер не доверяет им после sharp). */
  async markThumbnail(
    id: string,
    data: { thumbFileId: string; width: number; height: number },
  ): Promise<void> {
    await this.prisma.messageAttachment.update({ where: { id }, data });
  }

  /** Неотправленное вложение владельца (для отмены; null — уже отправлено/
   *  чужое/удалено — отмена best-effort). */
  async findUnclaimed(id: string, ownerId: string): Promise<AttachmentRow | null> {
    return this.prisma.messageAttachment.findFirst({
      where: { id, ownerId, messageId: null },
    });
  }

  /** Удаление неотправленного (одноразовая привязка могла успеть сработать —
   *  условие message_id IS NULL страхует от гонки с отправкой). */
  async deleteUnclaimed(id: string, ownerId: string): Promise<boolean> {
    const result = await this.prisma.messageAttachment.deleteMany({
      where: { id, ownerId, messageId: null },
    });
    return result.count > 0;
  }
}
