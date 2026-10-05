import { describe, expect, it } from 'vitest';

import {
  detectMentionQuery,
  insertMentionToken,
  mentionAtCaret,
  mentionTokens,
  mergeMentionCandidates,
  removeMentionToken,
  replaceMentionLabel,
} from './composer-mentions.js';

/** Логика @упоминаний композера (#176): чистые функции — детектор запроса,
 *  слияние кандидатов, вставка/правка/удаление токена. */

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('detectMentionQuery', () => {
  it('@ у каретки — панель с пустым запросом', () => {
    expect(detectMentionQuery('привет @', 8)).toEqual({ query: '', start: 7, end: 8 });
  });

  it('@ + буквы — запрос до каретки', () => {
    expect(detectMentionQuery('привет @арт', 11)).toEqual({ query: 'арт', start: 7, end: 11 });
  });

  it('каретка ушла дальше запроса (пробел) — закрыто', () => {
    expect(detectMentionQuery('привет @арт ', 12)).toBeNull();
  });

  it('email a@b — не запрос: @ в середине слова', () => {
    expect(detectMentionQuery('пиши на a@b', 12)).toBeNull();
  });

  it('@ в начале строки — валидно', () => {
    expect(detectMentionQuery('@анн', 4)).toEqual({ query: 'анн', start: 0, end: 4 });
  });

  it('запрос длиннее 32 символов — закрыто', () => {
    expect(detectMentionQuery('@' + 'а'.repeat(33), 34)).toBeNull();
  });
});

describe('mergeMentionCandidates', () => {
  const members = [{ id: UUID_A, displayName: 'Анна Первая', avatarUrl: null }];
  const directory = [
    {
      id: UUID_A,
      displayName: 'Анна Первая',
      status: 'active' as const,
      avatarUrl: null,
      positionName: 'ГИП',
      departmentName: 'Отдел изысканий',
      email: 'a@nodus.local',
      managerId: null,
      departmentId: null,
      legalDepartmentId: null,
    },
    {
      id: UUID_B,
      displayName: 'Артём Маторин',
      status: 'active' as const,
      avatarUrl: null,
      positionName: null,
      departmentName: null,
      email: 'art@nodus.local',
      managerId: null,
      departmentId: null,
      legalDepartmentId: null,
    },
  ];

  it('участники первыми и обогащаются справочником; не-участник с пометкой; себя нет', () => {
    const list = mergeMentionCandidates(members, directory, '', undefined);
    expect(list[0]).toMatchObject({
      id: UUID_A,
      inConversation: true,
      positionName: 'ГИП',
    });
    expect(list[1]).toMatchObject({ id: UUID_B, inConversation: false });
    // Себя не предлагаем (сервер пингует только ≠ автора): я = Анна.
    const asAnna = mergeMentionCandidates(members, directory, '', UUID_A);
    expect(asAnna.map((c) => c.id)).toEqual([UUID_B]);
  });

  it('фильтр участников по подстроке без регистра', () => {
    const list = mergeMentionCandidates(members, [], 'АНН', undefined);
    expect(list.map((c) => c.id)).toEqual([UUID_A]);
  });

  it('поиск справочника по ФИО находит не-участника', () => {
    const list = mergeMentionCandidates([], directory, 'матор', undefined);
    expect(list.map((c) => c.id)).toEqual([UUID_B]);
    expect(list[0]?.inConversation).toBe(false);
  });
});

describe('insertMentionToken / правка / удаление', () => {
  it('вставка заменяет запрос на токен с пробелом, каретка после', () => {
    const text = 'отправьте @арт пожалуйста';
    const res = insertMentionToken(
      text,
      { query: 'арт', start: 10, end: 14 },
      {
        id: UUID_A,
        displayName: 'Артём Маторин',
      },
    );
    expect(res.text).toBe(`отправьте @[Артём Маторин](user:${UUID_A})  пожалуйста`);
    expect(res.caret).toBe(`отправьте @[Артём Маторин](user:${UUID_A}) `.length);
  });

  it('правка label не меняет привязку', () => {
    const token = `@[Артём](user:${UUID_A}) и @[Борис](user:${UUID_B})`;
    const edited = replaceMentionLabel(token, 0, 'Артёму Маторину');
    expect(edited).toBe(`@[Артёму Маторину](user:${UUID_A}) и @[Борис](user:${UUID_B})`);
  });

  it('пустой label правкой не применяется', () => {
    const token = `@[Артём](user:${UUID_A})`;
    expect(replaceMentionLabel(token, 0, '   ')).toBe(token);
  });

  it('удаление убирает токен целиком с разметкой', () => {
    const token = `вот @[Артём](user:${UUID_A}) текст`;
    expect(removeMentionToken(token, 0)).toBe('вот  текст');
  });
});

describe('mentionTokens / mentionAtCaret', () => {
  it('позиции токенов в тексте', () => {
    const tokens = mentionTokens(`до @[А](user:${UUID_A}) после @[Б](user:${UUID_B})`);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ id: UUID_A, label: 'А', start: 3 });
    expect(tokens[1]).toMatchObject({ id: UUID_B, label: 'Б' });
  });

  it('клик в label-часть — токен найден; в хвост uuid — нет', () => {
    const text = `@[Артём](user:${UUID_A}) хвост`;
    const labelEnd = 2 + 'Артём'.length;
    expect(mentionAtCaret(text, labelEnd)?.id).toBe(UUID_A);
    expect(mentionAtCaret(text, text.length - 1)).toBeNull();
  });
});
