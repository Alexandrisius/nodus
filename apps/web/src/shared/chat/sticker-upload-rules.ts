/** Правила загрузки стикеров (#143): форматы/лимиты (спека Telegram/issue:
 *  WebP/PNG ≤512КБ сторона ~512; WebM без звука ≤3с ≤256КБ) + быстрая
 *  палитра эмодзи-привязок. Чистые функции — детерминированные тесты. */

export const STATIC_MAX_BYTES = 512 * 1024;
export const WEBM_MAX_BYTES = 256 * 1024;
export const WEBM_MAX_SECONDS = 3;
export const STICKER_ACCEPT = '.png,.webp,.webm,image/png,image/webp,video/webm';
/** Палитра эмодзи-привязок в диалоге (прецедент — reaction-presets.ts):
 *  константа подбора, не бизнес-справочник. */
export const QUICK_EMOJI = [
  '👍',
  '❤️',
  '😂',
  '🔥',
  '🎉',
  '🙏',
  '👀',
  '😎',
  '✅',
  '💯',
  '🚀',
  '💡',
  '😅',
  '🤝',
  '⭐',
  '😮',
] as const;

export type StickerIssue = 'format' | 'size' | 'duration';

export function isWebmFile(file: File): boolean {
  return file.type === 'video/webm' || file.name.toLowerCase().endsWith('.webm');
}

/** Синхронная превалидация ДО трафика: формат и размер (чистая функция). */
export function validateStickerFile(file: File): StickerIssue | null {
  const webm = isWebmFile(file);
  const mimeOk = webm || file.type === 'image/webp' || file.type === 'image/png';
  if (!mimeOk) return 'format';
  if (file.size > (webm ? WEBM_MAX_BYTES : STATIC_MAX_BYTES)) return 'size';
  return null;
}

/** Габариты (img) и длительность (WebM) — по metadata элемента, до загрузки;
 *  битый файл/таймаут — не ошибка: габариты опциональны, лимиты проверит
 *  сервер по magic bytes (Ф2 #143). */
export async function probeStickerMedia(
  file: File,
  isWebm: boolean,
): Promise<{ width: number | null; height: number | null; durationIssue: boolean }> {
  const url = URL.createObjectURL(file);
  try {
    if (isWebm) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('meta'));
        window.setTimeout(reject, 4000, new Error('timeout'));
      });
      return {
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationIssue: Number.isFinite(video.duration) && video.duration > WEBM_MAX_SECONDS + 0.2,
      };
    }
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { ...dims, durationIssue: false };
  } catch {
    return { width: null, height: null, durationIssue: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}
