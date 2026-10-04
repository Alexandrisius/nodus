import { create } from 'zustand';
import { ErrorCode, errorMessages } from '@nodus/contracts';

import { ApiError } from '../api-client.js';

/**
 * Инлайн-ошибки отправки в композере (#177): лимит важных и потолок группы
 * приходят кодом 409 из send-urgent.policy — тост здесь не подходит (текст
 * должен стоять РЯДОМ с молнией, пока пользователь правит сообщение).
 * Хранится КОД ошибки, текст берётся из словаря контрактов по коду (I15:
 * `message` в ответе — английский технический, пользователю не показывается).
 * Пользователь хука: api.ts onError ставит код, композер рендерит текст,
 * молния (composer-urgent) по коду CHAT_URGENT_LIMIT_EXCEEDED приглушается
 * даже при закрытом попапе (политика опрашивается только там). Гасит код
 * новая попытка отправки (onMutate).
 */
interface ComposerErrorsState {
  codes: Record<string, string>;
  set: (key: string, code: string) => void;
  clear: (key: string) => void;
}

export const useComposerErrors = create<ComposerErrorsState>()((set) => ({
  codes: {},
  set: (key, code) => set((s) => ({ codes: { ...s.codes, [key]: code } })),
  clear: (key) =>
    set((s) => {
      if (!(key in s.codes)) return s;
      const codes = { ...s.codes };
      delete codes[key];
      return { codes };
    }),
}));

/** Классификация ошибки отправки: код 409 политики важных — вернуть его,
 *  остальное — null (штатный тост sendError). */
export function composerSendErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED) return error.code;
  if (error.code === ErrorCode.CHAT_URGENT_GROUP_TOO_LARGE) return error.code;
  return null;
}

/** Инлайн-сообщение композера: русская строка словаря по коду из стора. */
export function useComposerSendError(key: string): { code: string; message: string } | null {
  const code = useComposerErrors((s) => s.codes[key]);
  if (!code) return null;
  const message = errorMessages[code as ErrorCode];
  return message ? { code, message } : null;
}
