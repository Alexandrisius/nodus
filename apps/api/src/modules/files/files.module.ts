import { Global, Module } from '@nestjs/common';

import { FILE_STORAGE } from '../../core/ports/file-storage.port.js';
import { FileStorageProvider } from './file-storage.provider.js';
import { FILES_CONFIG, getFilesConfig } from './files.config.js';
import { FilesController } from './files.controller.js';
import { FilesRepository } from './files.repository.js';
import { MinioStorageDriver } from './storage/minio-storage.driver.js';

/**
 * Модуль files (M9 фаза 1, #57, ADR-0013): объектное хранилище MinIO +
 * метаданные file_objects/file_versions. Наружу (I3) — только порт
 * FILE_STORAGE (сейв/удаление стримом) и GET /files/:id/content по подписи;
 * бакеты/ключи/драйвер — внутренности. @Global — как CryptoModule: токен
 * FILE_STORAGE инжектится модулям-потребителям (chat, дальше correspondence)
 * БЕЗ межмодульного импорта (I3/I6 — boundaries его запрещают); потребители
 * знают только интерфейс из core/ports. Своего фичефлага нет: маршруты
 * потребителя живут под его флагом; отдача контента — по подписи.
 */
@Global()
@Module({
  controllers: [FilesController],
  providers: [
    { provide: FILES_CONFIG, useFactory: getFilesConfig },
    MinioStorageDriver,
    FilesRepository,
    FileStorageProvider,
    { provide: FILE_STORAGE, useExisting: FileStorageProvider },
  ],
  exports: [FILE_STORAGE],
})
export class FilesModule {}
