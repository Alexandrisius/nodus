import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { PinoLogger } from 'nestjs-pino';

import { FILE_STORAGE, type FileStorage } from '../../../core/ports/file-storage.port.js';
import { MAX_ATTACHMENT_BYTES } from './attachments.service.js';
import { AttachmentsRepository } from './attachments.repository.js';

/** Максимальная сторона превью (WebP): плитки ленты ≤480 дизайн-px ×DPR —
 *  800 хватает и для галерей, и для лайтбокс-подложки (#150). */
export const THUMB_MAX_EDGE = 800;

/** EXIF-ориентации 5–8 — поворот на 90°: физические width/height в файле
 *  нужно менять местами, чтобы совпасть с тем, что видит браузер. */
function orientedSize(
  width: number,
  height: number,
  orientation?: number,
): { width: number; height: number } {
  return orientation !== undefined && orientation >= 5
    ? { width: height, height: width }
    : { width, height };
}

async function readAll(stream: Readable, cap: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += (chunk as Buffer).length;
    if (total > cap) throw new Error(`original exceeds ${cap} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Генерация серверных превью вложений-изображений (#150, ADR-0015):
 * оригинал из хранилища → sharp (метаданные авторитетно, EXIF-поворот) →
 * WebP max-edge 800 → дериват в хранилище (FileObject с derivedFrom —
 * «превью такого-то файла») → thumbFileId в message_attachments. Плитки
 * ленты и подложка лайтбокса грузят превью (десятки КБ) вместо оригиналов
 * (мегабайты через туннель).
 *
 * Контракт отказоустойчивости: превью ОПЦИОНАЛЬНО — не-изображение,
 * недекодируемый файл, исчезнувший объект или сбой хранилища оставляют
 * thumbFileId=null (клиент показывает оригинал, геометрия детерминирована
 * отдельно). Идемпотентно: готовое превью — no-op. Вне HTTP: вызывается
 * только из BullMQ-воркера и backfill-скрипта.
 */
@Injectable()
export class ThumbnailService {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly repository: AttachmentsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ThumbnailService.name);
  }

  async generateFor(attachmentId: string): Promise<void> {
    const attachment = await this.repository.findAnyById(attachmentId);
    if (!attachment || attachment.kind !== 'image' || attachment.thumbFileId) return;

    const original = await this.storage.get(attachment.fileId);
    if (!original) return;
    const input = await readAll(original.stream, MAX_ATTACHMENT_BYTES);

    try {
      const meta = await sharp(input, { failOn: 'none' }).metadata();
      if (!meta.width || !meta.height) {
        this.logger.warn({ attachmentId }, 'Превью: изображение без габаритов');
        return;
      }
      const size = orientedSize(meta.width, meta.height, meta.orientation);

      const thumb = await sharp(input, { failOn: 'none' })
        .rotate() // авто-поворот по EXIF — превью всегда в экспонируемой ориентации
        .resize({
          width: THUMB_MAX_EDGE,
          height: THUMB_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();

      const { fileId: thumbFileId } = await this.storage.save(
        {
          ownerId: attachment.ownerId,
          name: `${attachment.name}.preview.webp`,
          mime: 'image/webp',
          size: thumb.byteLength,
          derivedFrom: attachment.fileId,
        },
        Readable.from(thumb),
      );
      await this.repository.markThumbnail(attachmentId, {
        thumbFileId,
        width: size.width,
        height: size.height,
      });
    } catch (error) {
      // Недекодируемый файл/сбой декодера: превью опционально — тихий отказ
      // без ретраев (job не должен падать трижды на мусоре).
      this.logger.warn({ attachmentId, err: error }, 'Превью: декодирование не удалось');
    }
  }
}
