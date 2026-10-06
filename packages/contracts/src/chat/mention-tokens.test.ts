import { describe, expect, it } from 'vitest';

import {
  MENTION_TOKENS_MAX,
  buildMentionToken,
  extractMentionIds,
  parseMentionSegments,
  stripMentionTokens,
  truncateMentionText,
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
    expect(parseMentionSegments(`Отправьте @[Артёму Маторину](user:${UUID_A}) пожалуйста`)).toEqual(
      [
        { kind: 'text', value: 'Отправьте ' },
        { kind: 'mention', id: UUID_A, label: 'Артёму Маторину' },
        { kind: 'text', value: ' пожалуйста' },
      ],
    );
  });

  it('несколько токенов подряд, пустые текстовые сегменты не создаются', () => {
    expect(parseMentionSegments(`@[А](user:${UUID_A})@[Б](user:${UUID_B})`)).toEqual([
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
    expect(stripMentionTokens(`Отправьте @[Артёму Маторину](user:${UUID_A}) пожалуйста`)).toBe(
      'Отправьте Артёму Маторину пожалуйста',
    );
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

  it('скобка `]` в label вырезается (не ломает грамматику токена)', () => {
    const token = buildMentionToken('Ива]н', UUID_A);
    expect(parseMentionSegments(token)).toEqual([{ kind: 'mention', id: UUID_A, label: 'Иван' }]);
  });
});

describe('упоминание «Все» (#224, сентинел user:all)', () => {
  it('парсер читает токен @[Все](user:all) как mention с id=all', () => {
    expect(parseMentionSegments('внимание @[Все](user:all) — планёрка')).toEqual([
      { kind: 'text', value: 'внимание ' },
      { kind: 'mention', id: 'all', label: 'Все' },
      { kind: 'text', value: ' — планёрка' },
    ]);
  });

  it('extractMentionIds отдаёт all первым (сервер резолвит отдельно)', () => {
    expect(extractMentionIds(`@[Борис](user:${UUID_A}) и @[Все](user:all)`)).toEqual([
      'all',
      UUID_A,
    ]);
  });

  it('stripMentionTokens разворачивает Все в label; сборка токена симметрична', () => {
    expect(stripMentionTokens('@[Все](user:all), сбор')).toBe('Все, сбор');
    const token = buildMentionToken('Все', 'all');
    expect(token).toBe('@[Все](user:all)');
    expect(parseMentionSegments(token)).toEqual([{ kind: 'mention', id: 'all', label: 'Все' }]);
  });

  it('extractMentionIds: сентинел «все» не вытесняется лимитом 20 (#224)', () => {
    // 20 индивидуальных токенов ДО «Все» — сентинел обязан выжить
    const many = Array.from(
      { length: 21 },
      (_, i) => `@[Ч${i}](user:11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')})`,
    ).join(' ');
    const ids = extractMentionIds(`${many} @[Все](user:all)`);
    expect(ids[0]).toBe('all');
  });

  it('truncateMentionText: срез не режет токен — цитаты без огрызков (#224)', () => {
    const text = `длинное начало ${`@[Борис Ночной](user:${UUID_A})`} и хвост сообщения`;
    const cut = truncateMentionText(text, 20);
    // в результате нет ни одного незакрытого огрызка разметки
    expect(cut).not.toMatch(/@\[/);
    expect(parseMentionSegments(cut).every((seg) => seg.kind === 'text')).toBe(true);
    // короткий текст с токеном проходит ЦЕЛИКОМ (токен влезает — сохранён)
    const short = `@[Яс](user:${UUID_A}) ок`;
    expect(truncateMentionText(short, 100)).toBe(short);
  });

  it('all не матчится как часть другого слова/uuid-подобного хвоста', () => {
    expect(parseMentionSegments('@[Х](user:allx))')[0]).toEqual({
      kind: 'text',
      value: '@[Х](user:allx))',
    });
  });
});
