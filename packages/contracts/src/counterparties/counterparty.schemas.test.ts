import { describe, expect, it } from 'vitest';

import {
  addContactPersonBodySchema,
  createCounterpartyBodySchema,
  listCounterpartiesQuerySchema,
  normalizeUnp,
  similarCounterpartiesQuerySchema,
  unpInputSchema,
  updateContactPersonBodySchema,
  updateCounterpartyBodySchema,
} from './counterparty.schemas.js';

describe('normalizeUnp / unpInputSchema (#460)', () => {
  it('нормализует пробелы, дефисы, точки, префикс «УНП» и регистр', () => {
    expect(normalizeUnp(' 100 123 456 ')).toBe('100123456');
    expect(normalizeUnp('УНП 100123456')).toBe('100123456');
    expect(normalizeUnp('унп: 100-123-456')).toBe('100123456');
    expect(normalizeUnp('100.123.456')).toBe('100123456');
    expect(normalizeUnp('100–123—456')).toBe('100123456');
    expect(unpInputSchema.parse(' УНП 100 123 456 ')).toBe('100123456');
  });

  it('не навязывает белорусские «9 цифр»: буквенно-цифровые и короткие УНП валидны', () => {
    expect(unpInputSchema.parse('BY100123456')).toBe('BY100123456');
    expect(unpInputSchema.parse('12345678')).toBe('12345678');
    expect(unpInputSchema.parse('000000000')).toBe('000000000');
  });

  it('мусор и пустое значение отклоняются', () => {
    expect(unpInputSchema.safeParse('').success).toBe(false);
    expect(unpInputSchema.safeParse('УНП').success).toBe(false);
    expect(unpInputSchema.safeParse('---').success).toBe(false);
    expect(unpInputSchema.safeParse('123 456 789 012 345 678 901 234 567 890 123').success).toBe(
      false,
    );
  });
});

describe('createCounterpartyBodySchema (#460)', () => {
  it('схлопывает пробелы в названиях и нормализует УНП/почту', () => {
    const parsed = createCounterpartyBodySchema.parse({
      fullName: '  Общество   с ограниченной ответственностью «Тест» ',
      shortName: ' ООО «Тест» ',
      unp: 'УНП 100 123 456',
      email: ' Info@Test.BY ',
      phone: ' +375 29 123-45-67 ',
      address: ' 220004, г. Минск, ул. Притыцкого, 62 ',
    });
    expect(parsed).toEqual({
      fullName: 'Общество с ограниченной ответственностью «Тест»',
      shortName: 'ООО «Тест»',
      unp: '100123456',
      email: 'info@test.by',
      phone: '+375 29 123-45-67',
      address: '220004, г. Минск, ул. Притыцкого, 62',
    });
  });

  it('реквизиты необязательны: агент может прислать только названия (I2)', () => {
    expect(createCounterpartyBodySchema.parse({ fullName: 'Тест', shortName: 'Тест' })).toEqual({
      fullName: 'Тест',
      shortName: 'Тест',
    });
    expect(
      createCounterpartyBodySchema.parse({
        fullName: 'Тест',
        shortName: 'Тест',
        unp: null,
        email: null,
      }),
    ).toMatchObject({ unp: null, email: null });
  });

  it('пустые названия и битая почта отклоняются', () => {
    expect(
      createCounterpartyBodySchema.safeParse({ fullName: '  ', shortName: 'Тест' }).success,
    ).toBe(false);
    expect(
      createCounterpartyBodySchema.safeParse({ fullName: 'Тест', shortName: 'Тест', email: 'нет' })
        .success,
    ).toBe(false);
  });
});

describe('updateCounterpartyBodySchema / контакты (#460)', () => {
  it('частичная правка: любое подмножество полей, пустой объект отклоняется', () => {
    expect(updateCounterpartyBodySchema.parse({ phone: '+375 17 200-11-22' })).toEqual({
      phone: '+375 17 200-11-22',
    });
    expect(updateCounterpartyBodySchema.parse({ unp: null })).toEqual({ unp: null });
    expect(updateCounterpartyBodySchema.safeParse({}).success).toBe(false);
  });

  it('контактное лицо: обязательное ФИО, остальное необязательно; правка частичная', () => {
    expect(addContactPersonBodySchema.parse({ fullName: 'Иванов Иван' })).toEqual({
      fullName: 'Иванов Иван',
    });
    expect(
      addContactPersonBodySchema.parse({ fullName: 'Иванов Иван', email: ' I@X.BY ' }),
    ).toMatchObject({ email: 'i@x.by' });
    expect(updateContactPersonBodySchema.parse({ position: 'Директор' })).toEqual({
      position: 'Директор',
    });
    expect(updateContactPersonBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('query-схемы списка и похожих (#460)', () => {
  it('includeArchived читается строкой (stringbool), по умолчанию false', () => {
    expect(listCounterpartiesQuerySchema.parse({})).toMatchObject({ includeArchived: false });
    expect(listCounterpartiesQuerySchema.parse({ includeArchived: 'true' })).toMatchObject({
      includeArchived: true,
    });
    expect(listCounterpartiesQuerySchema.parse({ search: ' галургия ' })).toMatchObject({
      search: 'галургия',
    });
  });

  it('похожие: нужно хотя бы одно поле, УНП нормализуется', () => {
    expect(similarCounterpartiesQuerySchema.parse({ name: 'Галургея' })).toEqual({
      name: 'Галургея',
    });
    expect(similarCounterpartiesQuerySchema.parse({ unp: 'УНП 100 123 456' })).toEqual({
      unp: '100123456',
    });
    expect(similarCounterpartiesQuerySchema.safeParse({}).success).toBe(false);
    expect(similarCounterpartiesQuerySchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
