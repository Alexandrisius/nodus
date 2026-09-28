import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import { Transform, type Readable } from 'node:stream';
import { ErrorCode } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { FILES_CONFIG, type FilesConfig } from '../files.config.js';

export interface PutResult {
  etag: string | null;
  /** Фактически прожитые байты (сверка с заявленным size — провайдером). */
  bytes: number;
}

/**
 * Драйвер MinIO (S3 API) — реализация транспортной части хранилища ADR-0013.
 * Живёт внутри модуля files: бакеты/ключи наружу не выходят (наружу — порт
 * FILE_STORAGE). Стрим без буферизации: putObject требует заявленный size,
 * фактический подсчёт — обёрткой-счётчиком (обрыв/подмена = мусор не храним).
 */
@Injectable()
export class MinioStorageDriver implements OnModuleInit {
  private readonly client: Minio.Client;

  constructor(@Inject(FILES_CONFIG) private readonly config: FilesConfig) {
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  /** Бакет создаётся лениво на старте (compose-контур делает это minio-init,
   *  host-dev/CI — здесь; идемпотентно). Fail-fast: недоступный MinIO —
   *  понятная ошибка старта, а не 500-е на каждом вложении. */
  async onModuleInit(): Promise<void> {
    const { bucket } = this.config;
    if (!(await this.client.bucketExists(bucket))) {
      await this.client.makeBucket(bucket);
    }
  }

  async put(key: string, size: number, mime: string, content: Readable): Promise<PutResult> {
    let bytes = 0;
    const counted = content.pipe(
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(null, chunk);
        },
      }),
    );
    try {
      const info = await this.client.putObject(this.config.bucket, key, counted, size, {
        'Content-Type': mime,
      });
      return { etag: info.etag ?? null, bytes };
    } catch (error) {
      // Обрыв/подмена размера часто валит сам SDK (Content-Length не сойдётся)
      // — переводим в доменную ошибку по счётчику, объект подчищаем.
      if (bytes !== size) {
        await this.remove([key]).catch(() => undefined);
        throw new DomainException(
          ErrorCode.FILE_SIZE_MISMATCH,
          'Streamed bytes do not match declared size',
          { declared: size, streamed: bytes },
        );
      }
      throw error;
    }
  }

  async get(key: string): Promise<Readable> {
    return this.client.getObject(this.config.bucket, key);
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.removeObjects(this.config.bucket, keys);
  }
}
