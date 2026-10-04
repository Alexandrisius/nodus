import { create } from 'zustand';

import { ui } from '@nodus/contracts';

import { ApiError } from '../api-client.js';
import { ErrorCode } from '@nodus/contracts';

/**
 * Инлайн-ошибки отправки в композере (#177): лимит важных и потолок группы
 * приходят кодом 409 из send-urgent.policy — тост здесь не подходит (текст
 * должен стоять РЯДОМ с молнией, пока пользователь правит сообщение).
 * Ключ — draftScope композера (= focusId), ошибку ставит onError мутации
 * отправки, гасит новая попытка (onMutate) и размонтирование.
 */
interface ComposerErrorsState {
  errors: Record<string, string>;
  set: (key: string, message: string) => void;
  clear: (key: string) => void;
}

export const useComposerErrors = create<ComposerErrorsState>()((set) => ({
  errors: {},
  set: (key, message) => set((s) => ({ errors: { ...s.errors, [key]: message } })),
  clear: (key) =>
    set((s) => {
      if (!(key in s.errors)) return s;
      const errors = { ...s.errors };
      delete errors[key];
      return { errors };
    }),
}));

/** Классификация ошибки отправки: 409 политики важных — инлайн-текст,
 *  остальное — null (штатный тост sendError). */
export function composerSendErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED)
    return ui.notifications.urgentLimitReached;
  if (error.code === ErrorCode.CHAT_URGENT_GROUP_TOO_LARGE) return error.message;
  return null;
}
