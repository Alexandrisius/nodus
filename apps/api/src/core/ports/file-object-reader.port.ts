import type { InjectionToken } from '@nestjs/common';

/**
 * Read-порт метаданных файлов (ADR-0012, #55): письмо ссылается на файлы
 * plain UUID (I3), а карточке нужны имя, mime и размер для плиток и
 * просмотрщика. Подписанные ссылки письма строит `SignedUrlService` сам —
 * порт отдаёт только метаданные; содержимое отдаёт files по подписи.
 *
 * Появление порта = появление первого потребителя (ADR-0010): до писем
 * метаданные хранились денормализацией у владельца (message_attachments).
 */
export const FILE_OBJECT_READER: InjectionToken = 'FILE_OBJECT_READER';

/** Метаданные живого файла (удалённые пропускаются). */
export interface FileObjectRef {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface FileObjectReader {
  /** Файлы по id пачкой; отсутствующие и удалённые — пропущены.
   *  Пустой вход — без запроса к БД. */
  refs(ids: readonly string[]): Promise<FileObjectRef[]>;
}
