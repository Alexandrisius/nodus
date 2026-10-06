import type { ChatMessage } from '@nodus/contracts';

import type { ThumbnailQueue } from './thumbnail.queue.js';

/**
 * Ленивый прогрев превью (#221): изображения без миниатюры (сбой очереди
 * прошлых прогонов, строка старее конвейера) замечены показом ленты —
 * ставим фоновую задачу; готовность привезёт chat.attachment_preview_ready,
 * а до неё плитка держит заглушку и НЕ грузит оригинал. Джобы идемпотентны
 * (готовое превью — no-op воркера), повторный показ того же miss'а дешёв.
 */
export function warmMissingPreviews(items: ChatMessage[], queue: ThumbnailQueue): void {
  for (const message of items) {
    for (const attachment of message.attachments) {
      if (attachment.kind !== 'image' || attachment.thumbnailUrl !== null) continue;
      void queue.enqueue(attachment.id, attachment.fileId).catch(() => undefined);
    }
  }
}
