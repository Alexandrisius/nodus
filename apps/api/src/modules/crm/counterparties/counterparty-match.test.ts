import { describe, expect, it } from 'vitest';

import { normalizeCounterpartyName, similarNameQuery } from './counterparty-match.js';

describe('normalizeCounterpartyName (#460)', () => {
  it('убирает кавычки, регистр и организационно-правовую форму', () => {
    expect(normalizeCounterpartyName('АО «Галургия»')).toBe('галургия');
    expect(normalizeCounterpartyName('ООО «СтройЗаказчик»')).toBe('стройзаказчик');
    expect(normalizeCounterpartyName('ООО "Строй-Заказчик"')).toBe('строй заказчик');
    expect(normalizeCounterpartyName('  Открытое   акционерное общество  ')).toBe(
      'открытое акционерное общество',
    );
    expect(normalizeCounterpartyName('ОАО «Галургия»')).toBe('галургия');
  });

  it('унифицирует ё и пунктуацию, не трогая буквы и цифры', () => {
    expect(normalizeCounterpartyName('ПромСтройМонтаж № 3')).toBe('промстроймонтаж 3');
    expect(normalizeCounterpartyName('ООО «ПромСтройМонтаж»')).toBe(
      normalizeCounterpartyName('промстроймонтаж'),
    );
  });
});

describe('similarNameQuery (#460)', () => {
  it('короткие названия и пустой ввод не участвуют в подсказке по имени', () => {
    expect(similarNameQuery(undefined)).toBe('');
    expect(similarNameQuery('   ')).toBe('');
    expect(similarNameQuery('ООО')).toBe('');
    expect(similarNameQuery('ИП')).toBe('');
    expect(similarNameQuery('АО')).toBe('');
  });

  it('название от 3 символов идёт в подсказку', () => {
    expect(similarNameQuery('Галургея')).toBe('галургея');
    expect(similarNameQuery('ООО Стройзаказчик')).toBe('стройзаказчик');
    expect(similarNameQuery('Минстройархитектуры')).toBe('минстройархитектуры');
  });
});
