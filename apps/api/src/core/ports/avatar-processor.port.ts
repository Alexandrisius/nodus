import type { InjectionToken } from '@nestjs/common';
import type { Readable } from 'node:stream';

/**
 * Порт обработки аватарок (#186): модули-потребители (chat — аватар беседы,
 * directory — аватар профиля) валидируют и квадратизируют фото, не зная про
 * sharp и хранилище. Реализация — AvatarService модуля files (биндинг токена
 * там же, паттерн FILE_STORAGE/ADR-0013); появление порта = появление двух
 * потребителей (ADR-0010).
 */
export interface AvatarProcessor {
  /** Валидация (magic bytes PNG/JPEG/WebP ≤2 МБ) → квадратный WebP-дериват
   *  в хранилище (derivedFrom = оригинал); возвращает fileId деривата — его
   *  вешают на сущность. */
  process(
    input: { ownerId: string; name: string; size: number },
    content: Readable,
  ): Promise<{ fileId: string }>;
}

export const AVATAR_PROCESSOR: InjectionToken = 'AVATAR_PROCESSOR';
