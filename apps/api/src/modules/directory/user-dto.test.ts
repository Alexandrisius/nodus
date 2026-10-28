import { describe, expect, it } from 'vitest';

import { buildDisplayName } from './user-dto.js';

describe('buildDisplayName', () => {
  it('«Фамилия Имя» — отчество в displayName НЕ входит (#132)', () => {
    expect(
      buildDisplayName({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' }),
    ).toBe('Иванов Иван');
    expect(buildDisplayName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
});
