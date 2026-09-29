import type { InjectionToken } from '@nestjs/common';
import type { Readable } from 'node:stream';

/**
 * Порт файлового хранилища (I3/I13, ADR-0013): модули-потребители (chat —
 * вложения сообщений, дальше correspondence — вложения писем) сохраняют и
 * удаляют файлы, не зная про MinIO, бакеты и ключи. Реализация — модуль files
 * (FilesStorageProvider + MinIO-драйвер), биндинг токена — там же; таблицы
 * file_* — только через репозитории модуля files.
 * Появление порта = появление первого потребителя (#57, ADR-0010).
 */
export interface FileStorageSaveInput {
  ownerId: string;
  /** Исходное имя файла (Content-Disposition при отдаче). */
  name: string;
  mime: string;
  /** Заявленный размер в байтах: провайдер сверит с фактически прожитыми. */
  size: number;
  /** Дериват: FileObject порождён из этого файла (превью #150); null —
   *  обычный пользовательский файл. Маркер пишется в file_objects.derivedFrom. */
  derivedFrom?: string;
}

export interface FileStorageContent {
  stream: Readable;
  mime: string;
  name: string;
  size: number;
}

export interface FileStorage {
  /** Стримит содержимое в объектное хранилище (без буферизации в памяти),
   *  пишет file_objects + file_versions (v1), возвращает id FileObject.
   *  При несовпадении фактического размера с заявленным объект удаляется. */
  save(input: FileStorageSaveInput, content: Readable): Promise<{ fileId: string }>;

  /** Контент файла (текущей версии) по id; null — файла нет/удалён/объект
   *  исчез (#150: воркер превью читает оригинал через порт, не зная про
   *  MinIO и ключи). Права решает модуль-потребитель ДО вызова. */
  get(fileId: string): Promise<FileStorageContent | null>;

  /** Удаляет объекты и строки файлов. Решение «можно ли удалить» (файл не
   *  привязан к сообщению) принадлежит модулю-потребителю — файлы не знают
   *  про чужие сущности. Best-effort: отсутствующий объект не ошибка. */
  remove(fileIds: string[]): Promise<void>;
}

export const FILE_STORAGE: InjectionToken = 'FILE_STORAGE';
