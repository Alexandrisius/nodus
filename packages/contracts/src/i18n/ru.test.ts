import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../errors/error-codes.js';
import { errorMessages } from './ru.js';

describe('i18n/ru: errorMessages', () => {
  it('каждый системный код ошибки имеет русскую строку', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(errorMessages[code], `нет строки для ${code}`).toBeTruthy();
    }
  });
});
