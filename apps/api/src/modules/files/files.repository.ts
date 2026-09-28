import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service.js';

export interface FileObjectRow {
  id: string;
  ownerId: string;
  bucket: string;
  key: string;
  name: string;
  mime: string;
  size: number;
  scanStatus: string;
  createdAt: Date;
}

export interface FileVersionRow {
  id: string;
  fileObjectId: string;
  version: number;
  key: string;
  size: number;
  mime: string;
  createdAt: Date;
}

/**
 * Репозиторий модуля files: единственный, кто трогает таблицы file_objects/
 * file_versions (I3/I6). Чужие модули ссылаются на файлы plain UUID (правило
 * data-model: между таблицами модулей — без FK).
 */
@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** FileObject + FileVersion v1 одной транзакцией (после успешного put). */
  async createWithVersion(row: {
    id: string;
    ownerId: string;
    bucket: string;
    key: string;
    name: string;
    mime: string;
    size: number;
  }): Promise<FileObjectRow> {
    const created = await this.prisma.fileObject.create({
      data: {
        id: row.id,
        ownerId: row.ownerId,
        bucket: row.bucket,
        key: row.key,
        name: row.name,
        mime: row.mime,
        size: row.size,
        scanStatus: 'pending',
        versions: {
          create: {
            version: 1,
            key: row.key,
            size: row.size,
            mime: row.mime,
          },
        },
      },
    });
    return created;
  }

  async findById(id: string): Promise<FileObjectRow | null> {
    return this.prisma.fileObject.findFirst({ where: { id, deletedAt: null } });
  }

  /** Строки (с ключами всех версий) для удаления объектов из хранилища. */
  async findForRemoval(fileIds: string[]): Promise<{ keys: string[]; ids: string[] }> {
    if (fileIds.length === 0) return { keys: [], ids: [] };
    const objects = await this.prisma.fileObject.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, key: true, versions: { select: { key: true } } },
    });
    const keys = new Set<string>();
    for (const object of objects) {
      keys.add(object.key);
      for (const version of object.versions) keys.add(version.key);
    }
    return { keys: [...keys], ids: objects.map((object) => object.id) };
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.fileObject.deleteMany({ where: { id: { in: ids } } });
  }
}
