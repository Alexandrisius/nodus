import type { MessageAttachment } from '@nodus/contracts';

import { apiUpload } from '../api-client.js';

/**
 * Загрузка вложения композера (A1, #87): POST /chat/attachments →
 * MessageAttachment; сообщение отправляется с attachmentIds.
 * Лимиты — вердикт владельца 24.09: 100 МБ на файл, ≤ 20 файлов на сообщение.
 * Прогресс: XHR upload.onprogress (живой API) + таймер-пол в моках — события
 * прогресса при перехвате MSW ненадёжны, а лента загрузки должна жить.
 */

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 20;

export type UploadIssue = 'too-large' | 'too-many';

/** Валидация ДО старта загрузки (канон research: ошибка инлайном, не после
 *  потраченного трафика). Чистая функция — детерминированный unit-тест. */
export function validateFiles(
  incoming: File[],
  alreadyPending: number,
): { accepted: File[]; issue: UploadIssue | null } {
  const accepted: File[] = [];
  for (const file of incoming) {
    if (file.size > MAX_FILE_BYTES) return { accepted, issue: 'too-large' };
    if (alreadyPending + accepted.length >= MAX_FILES_PER_MESSAGE) {
      return { accepted, issue: 'too-many' };
    }
    accepted.push(file);
  }
  return { accepted, issue: null };
}

async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    return null; // не изображение или битый файл — габариты не обязательны
  }
}

export interface UploadHandle {
  promise: Promise<MessageAttachment>;
  cancel: () => void;
}

export function uploadAttachment(file: File, onProgress: (fraction: number) => void): UploadHandle {
  const controller = new AbortController();
  // Таймер-пол прогресса: растёт к 90% пока нет реальных событий/ответа.
  let simulated = 0;
  let realEvents = false;
  const timer = window.setInterval(() => {
    if (realEvents) return;
    simulated = Math.min(0.9, simulated + 0.12);
    onProgress(simulated);
  }, 180);

  const promise = (async () => {
    // MOCK-СОГЛАШЕНИЕ (см. chat-mutation-handlers): objectURL создаётся в
    // странице и передаётся серверу как previewUrl — blob из SW не резолвится.
    // В проде MinIO вернёт собственный url, поле будет проигнорировано.
    const objectUrl = URL.createObjectURL(file);
    const dims = file.type.startsWith('image/') ? await imageDimensions(file) : null;
    const form = new FormData();
    form.append('file', file);
    form.append('previewUrl', objectUrl);
    if (dims) {
      form.append('width', String(dims.width));
      form.append('height', String(dims.height));
    }
    try {
      const attachment = await apiUpload<MessageAttachment>('/chat/attachments', form, {
        signal: controller.signal,
        onProgress: (fraction) => {
          realEvents = true;
          onProgress(Math.max(fraction, simulated));
        },
      });
      onProgress(1);
      return attachment;
    } finally {
      window.clearInterval(timer);
    }
  })();

  return { promise, cancel: () => controller.abort() };
}
