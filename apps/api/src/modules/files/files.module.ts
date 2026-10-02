import { Global, Module } from '@nestjs/common';

import { FILE_STORAGE } from '../../core/ports/file-storage.port.js';
import { FileStorageProvider } from './file-storage.provider.js';
import { FILES_CONFIG, getFilesConfig } from './files.config.js';
import { FilesController } from './files.controller.js';
import { FilesRepository } from './files.repository.js';
import { MinioStorageDriver } from './storage/minio-storage.driver.js';
import { OFFICE_CONFIG, getOfficeConfig } from './office/office.config.js';
import { OfficeCallbackService } from './office/office-callback.service.js';
import { OfficeController } from './office/office.controller.js';
import { OfficeSessionService } from './office/office-session.service.js';
import { OfficeTokenService } from './office/office-token.service.js';
import { DERIVATIVES_CONFIG, getDerivativesConfig } from './derivatives/derivatives.config.js';
import { DerivativesQueue } from './derivatives/derivatives.queue.js';
import { DerivativesRepository } from './derivatives/derivatives.repository.js';
import { DerivativesService } from './derivatives/derivatives.service.js';
import { DerivativesWorker } from './derivatives/derivatives.worker.js';
import { AttachmentSentHandler } from './events/attachment-sent.handler.js';

/**
 * Модуль files (M9, #57 ADR-0013 + #138 движок просмотра + #139 конвейер
 * производных): объектное хранилище + метаданные file_objects/file_versions
 * + ONLYOFFICE-сессии + PDF-производные (Gotenberg, очередь BullMQ).
 * Наружу (I3): порт FILE_STORAGE, GET /files/:id/content по подписи,
 * office-эндпоинты (#138). @Global — как CryptoModule: токен FILE_STORAGE
 * инжектится модулями-потребителями (chat, дальше correspondence) БЕЗ
 * межмодульного импорта (I3/I6); обратное направление (права контекста) —
 * multi-порт FILE_ACCESS_CONTRIBUTORS от потребителей (core/ports).
 * Своего фичефлага нет: офис-движок гейтится OFFICE_ENABLED (внутри
 * колбэка/сессии), маршруты потребителя — под его флагом.
 */
@Global()
@Module({
  controllers: [FilesController, OfficeController],
  providers: [
    { provide: FILES_CONFIG, useFactory: getFilesConfig },
    { provide: OFFICE_CONFIG, useFactory: getOfficeConfig },
    { provide: DERIVATIVES_CONFIG, useFactory: getDerivativesConfig },
    MinioStorageDriver,
    FilesRepository,
    FileStorageProvider,
    OfficeTokenService,
    OfficeSessionService,
    OfficeCallbackService,
    DerivativesRepository,
    DerivativesQueue,
    DerivativesService,
    DerivativesWorker,
    // Запуск конвейера по подтверждению вложений (#139): files слушает
    // chat.message_sent — связь модулей событием (I3).
    AttachmentSentHandler,
    { provide: FILE_STORAGE, useExisting: FileStorageProvider },
  ],
  exports: [FILE_STORAGE],
})
export class FilesModule {}
