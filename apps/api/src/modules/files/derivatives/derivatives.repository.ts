import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service.js';

/** Строка производной (file_derivatives, #139). */
export interface FileDerivativeRow {
  id: string;
  fileObjectId: string;
  version: number;
  kind: string;
  status: string;
  key: string | null;
  size: number;
  mime: string;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Репозиторий производных файлов (#139): upsert-семантика (уникальность
 * (fileObjectId, version, kind) — перегенерация той же версии перезаписывает
 * строку и объект; #156: старый объект удаляется при перезаписи ключа).
 */
@Injectable()
export class DerivativesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    fileObjectId: string,
    version: number,
    kind: string,
  ): Promise<FileDerivativeRow | null> {
    return this.prisma.fileDerivative.findUnique({
      where: { fileObjectId_version_kind: { fileObjectId, version, kind } },
    });
  }

  /** Строка pending создаётся при постановке в очередь (видимость статуса);
   * ready-строка повторной постановкой не откатывается. */
  async ensurePending(input: {
    fileObjectId: string;
    version: number;
    kind: string;
  }): Promise<void> {
    await this.prisma.fileDerivative.upsert({
      where: {
        fileObjectId_version_kind: {
          fileObjectId: input.fileObjectId,
          version: input.version,
          kind: input.kind,
        },
      },
      create: { ...input, mime: 'application/pdf', status: 'pending' },
      update: {},
    });
  }

  async markReady(input: {
    fileObjectId: string;
    version: number;
    kind: string;
    key: string;
    size: number;
  }): Promise<void> {
    await this.prisma.fileDerivative.update({
      where: {
        fileObjectId_version_kind: {
          fileObjectId: input.fileObjectId,
          version: input.version,
          kind: input.kind,
        },
      },
      data: {
        status: 'ready',
        key: input.key,
        size: input.size,
        error: null,
        attempts: { increment: 1 },
      },
    });
  }

  async markFailed(
    input: { fileObjectId: string; version: number; kind: string },
    error: string,
  ): Promise<void> {
    await this.prisma.fileDerivative.updateMany({
      where: {
        fileObjectId: input.fileObjectId,
        version: input.version,
        kind: input.kind,
      },
      data: { status: 'failed', error: error.slice(0, 500), attempts: { increment: 1 } },
    });
  }

  /** Ключи производных файла (всех версий) — для removeForRemoval (#156). */
  async keysOf(fileObjectId: string): Promise<string[]> {
    const rows = await this.prisma.fileDerivative.findMany({
      where: { fileObjectId, key: { not: null } },
      select: { key: true },
    });
    return rows.map((row) => row.key).filter((key): key is string => !!key);
  }
}
