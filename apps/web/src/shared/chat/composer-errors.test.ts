import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { ApiError } from '../api-client.js';
import { composerSendErrorCode } from './composer-errors.js';

/** Инлайн-ошибки отправки (#177): 409 политики важных — код в композер
 *  (текст — русская строка словаря по коду, I15: message сервера английский),
 *  прочие коды — штатный тост (null). */

describe('composerSendErrorCode (#177)', () => {
  it('лимит важных исчерпан — код доходит до стора композера', () => {
    const error = new ApiError(
      ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED,
      'Urgent message daily limit exceeded',
      409,
    );
    expect(composerSendErrorCode(error)).toBe(ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED);
  });

  it('потолок группы — код доходит до стора композера', () => {
    const error = new ApiError(
      ErrorCode.CHAT_URGENT_GROUP_TOO_LARGE,
      'Urgent messages are not allowed in conversations over the member limit',
      409,
    );
    expect(composerSendErrorCode(error)).toBe(ErrorCode.CHAT_URGENT_GROUP_TOO_LARGE);
  });

  it('прочие ошибки — null (тост sendError)', () => {
    expect(composerSendErrorCode(new ApiError(ErrorCode.VALIDATION_FAILED, 'x', 422))).toBeNull();
    expect(composerSendErrorCode(new Error('network'))).toBeNull();
  });
});
