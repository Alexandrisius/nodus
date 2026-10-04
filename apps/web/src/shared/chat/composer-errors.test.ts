import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { ApiError } from '../api-client.js';
import { composerSendErrorMessage } from './composer-errors.js';

/** Инлайн-ошибки отправки (#177): 409 политики важных — текст в композер,
 *  прочие коды — штатный тост (null). */

describe('composerSendErrorMessage (#177)', () => {
  it('лимит важных исчерпан — инлайн-строка из i18n', () => {
    const error = new ApiError(
      ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED,
      'Urgent message daily limit exceeded',
      409,
    );
    expect(composerSendErrorMessage(error)).toBe('Лимит важных на сегодня исчерпан');
  });

  it('потолок группы — серверное русское сообщение', () => {
    const error = new ApiError(
      ErrorCode.CHAT_URGENT_GROUP_TOO_LARGE,
      'Важные сообщения не отправляют в беседы больше 20 участников',
      409,
    );
    expect(composerSendErrorMessage(error)).toBe(
      'Важные сообщения не отправляют в беседы больше 20 участников',
    );
  });

  it('прочие ошибки — null (тост sendError)', () => {
    expect(
      composerSendErrorMessage(new ApiError(ErrorCode.VALIDATION_FAILED, 'x', 422)),
    ).toBeNull();
    expect(composerSendErrorMessage(new Error('network'))).toBeNull();
  });
});
