import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';
import type { FileStorage, FileStorageSaveInput } from '../../core/ports/file-storage.port.js';
import { FILES_CONFIG, STORAGE_MAX_FILE_BYTES, type FilesConfig } from './files.config.js';
import { FilesRepository } from './files.repository.js';
import { MinioStorageDriver } from './storage/minio-storage.driver.js';

/**
 * Реализация порта FILE_STORAGE (ADR-0013): сохранение — стрим в MinIO, затем
 * file_objects + file_versions (v1) в БД. Порядок «объект раньше строки»:
 * незаписанная строка после сбоя БД оставляет объект-сироту (уборка — фаза 2),
 * зато строка никогда не ссылается на несуществующий объект.
 */
@Injectable()
export class FileStorageProvider implements FileStorage {
  constructor(
    private readonly driver: MinioStorageDriver,
    private readonly repository: FilesRepository,
    @Inject(FILES_CONFIG) private readonly config: FilesConfig,
  ) {}

  async save(input: FileStorageSaveInput, content: Readable): Promise<{ fileId: string }> {
    if (!Number.isSafeInteger(input.size) || input.size < 0) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Invalid file size declared');
    }
    if (input.size > STORAGE_MAX_FILE_BYTES) {
      throw new DomainException(
        ErrorCode.FILE_SIZE_MISMATCH,
        'File exceeds storage limit',
        { maxBytes: STORAGE_MAX_FILE_BYTES },
        413,
      );
    }

    const fileId = randomUUID();
    // Ключ = детерминированная функция id: без санитизации имён (исходное имя
    // живёт в БД), карантинный префикс quarantine/ — фаза 2 (сканер).
    const key = `files/${fileId}`;
    const { bytes } = await this.driver.put(key, input.size, input.mime, content);
    if (bytes !== input.size) {
      // Обрыв/подмена размера: объект не храним, ссылку не выдаём.
      await this.driver.remove([key]);
      throw new DomainException(
        ErrorCode.FILE_SIZE_MISMATCH,
        'Streamed bytes do not match declared size',
        { declared: input.size, streamed: bytes },
      );
    }

    await this.repository.createWithVersion({
      id: fileId,
      ownerId: input.ownerId,
      bucket: this.config.bucket,
      key,
      name: input.name,
      mime: input.mime,
      size: input.size,
    });
    return { fileId };
  }

  async remove(fileIds: string[]): Promise<void> {
    const { keys, ids } = await this.repository.findForRemoval(fileIds);
    await this.driver.remove(keys);
    await this.repository.deleteMany(ids);
  }
}
