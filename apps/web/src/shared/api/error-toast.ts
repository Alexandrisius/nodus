import { errorMessages, ErrorCode, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { ApiError } from '../api-client.js';

/** Тост ошибки мутации: русская строка по коду ошибки из словаря (I15:
 * `message` в ответе — английский технический, пользователю — строка по
 * `code`), фолбэк — общая строка «не удалось». */
export function toastApiError(error: unknown): void {
  const code = error instanceof ApiError ? error.code : undefined;
  const message = code ? errorMessages[code as ErrorCode] : undefined;
  toast.error(message ?? ui.common.sendError);
}
