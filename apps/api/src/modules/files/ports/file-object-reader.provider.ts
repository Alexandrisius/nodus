import { Injectable } from '@nestjs/common';

import type {
  FileObjectReader,
  FileObjectRef,
} from '../../../core/ports/file-object-reader.port.js';
import { FilesRepository } from '../files.repository.js';

/**
 * Реализация порта метаданных файлов (#55): наружу — только интерфейс,
 * `file_objects` читает репозиторий модуля files (I3/I6).
 */
@Injectable()
export class FileObjectReaderProvider implements FileObjectReader {
  constructor(private readonly files: FilesRepository) {}

  async refs(ids: readonly string[]): Promise<FileObjectRef[]> {
    if (ids.length === 0) return [];
    const rows = await this.files.findByIds(ids);
    return rows.map((row) => ({ id: row.id, name: row.name, mime: row.mime, size: row.size }));
  }
}
