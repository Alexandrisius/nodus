import { describe, expect, it } from 'vitest';

import {
  MENTION_TOKENS_MAX,
  buildMentionToken,
  extractMentionIds,
  parseMentionSegments,
  stripMentionTokens,
} from './mention-tokens.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('parseMentionSegments', () => {
  it('текст без токенов — один текстовый сегмент', () => {
    expect(parseMentionSegments('привет, @Артём и a@b.by')).toEqual([
      { kind: 'text', value: 'привет, @Артём и a@b.by' },
    ]);
  });

  it('токен вытаскивается сегментом, текст вокруг сохраняется', () => {
    expect(parseMentionSegments(`Отправьте @[Артёму Маторину](user:${UUID_A}) пожалуйста`)).toEqual([
      { kind: 'text', value: 'Отправьте ' },
      { kind: 'mention', id: UUID_A, label: 'Артёму Маторину' },
      { kind: 'text', value: ' пожалуйста' },
    ]);
  });

  it('несколько токенов подряд, пустые текстовые сегменты не создаются', () => {
    expect(
      parseMentionSegments(`@[А](user:${UUID_A})@[Б](user:${UUID_B})`),
    ).toEqual([
      { kind: 'mention', id: UUID_A, label: 'А' },
      { kind: 'mention', id: UUID_B, label: 'Б' },
    ]);
  });

  it('незакрытый токен — обычный текст (устойчивость к обрыву)', () => {
    expect(parseMentionSegments(`@[Артём(user:${UUID_A}`)).toEqual([
      { kind: 'text', value: `@[Артём(user:${UUID_A}` },
    ]);
  });

  it('невалидный uuid — обычный текст', () => {
    expect(parseMentionSegments('@[Артём](user:not-a-uuid)')).toEqual([
      { kind: 'text', value: '@[Артём](user:not-a-uuid)' },
    ]);
  });

  it('заглавный hex uuid нормализуется к нижнему регистру', () => {
    const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    expect(parseMentionSegments(`@[x](user:${upper})`)).toEqual([
      { kind: 'mention', id: upper.toLowerCase(), label: 'x' },
    ]);
  });

  it('пустой label допустим (правка чипа стёрла текст)', () => {
    expect(parseMentionSegments(`@[](user:${UUID_A})`)).toEqual([
      { kind: 'mention', id: UUID_A, label: '' },
    ]);
  });

  it('label с пробелами и скобками-круглыми — часть чипа', () => {
    expect(parseMentionSegments(`@[Артём (ГИП)](user:${UUID_A})`)).toEqual([
      { kind: 'mention', id: UUID_A, label: 'Артём (ГИП)' },
    ]);
  });
});

describe('extractMentionIds', () => {
  it('дедуп по id, порядок появления', () => {
    expect(
      extractMentionIds(`@[А](user:${UUID_A}) @[Б](user:${UUID_B}) @[А2](user:${UUID_A})`),
    ).toEqual([UUID_A, UUID_B]);
  });

  it('токенов больше лимита — урезается до MENTION_TOKENS_MAX', () => {
    const many = Array.from(
      { length: MENTION_TOKENS_MAX + 5 },
      (_, i) => `@[u${i}](user:${String(i + 1).padStart(8, '0')}-0000-4000-8000-000000000000)`,
    ).join('');
    expect(extractMentionIds(many)).toHaveLength(MENTION_TOKENS_MAX);
  });

  it('голый @текст и email не упоминаются', () => {
    expect(extractMentionIds('@Артём и a@b.by')).toEqual([]);
  });
});

describe('stripMentionTokens', () => {
  it('токен разворачивается в отображаемый текст', () => {
    expect(
      stripMentionTokens(`Отправьте @[Артёму Маторину](user:${UUID_A}) пожалуйста`),
    ).toBe('Отправьте Артёму Маторину пожалуйста');
  });

  it('пустой label разворачивается в @', () => {
    expect(stripMentionTokens(`а @[](user:${UUID_A}).`)).toBe('а @.');
  });

  it('текст без токенов не меняется', () => {
    expect(stripMentionTokens('обычный @текст')).toBe('обычный @текст');
  });
});

describe('buildMentionToken', () => {
  it('собирает валидный токен, парсер читает его обратно', () => {
    const token = buildMentionToken('Артём', UUID_A);
    expect(token).toBe(`@[Артём](user:${UUID_A})`);
    expect(parseMentionSegments(`привет ${token}`)).toEqual([
      { kind: 'text', value: 'привет ' },
      { kind: 'mention', id: UUID_A, label: 'Артём' },
    ]);
  });
});
