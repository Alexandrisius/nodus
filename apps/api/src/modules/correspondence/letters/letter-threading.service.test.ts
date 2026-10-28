import { describe, expect, it } from 'vitest';

import type { LetterRef } from '@nodus/contracts';

import {
  LetterThreadingService,
  subjectOutgoingNumber,
  threadCandidates,
} from './letter-threading.service.js';
import type { LettersRepository } from './letters.repository.js';

const ref = (id: string): LetterRef => ({ id, regNumber: `Исх-2026/${id}`, subject: null });

describe('цепочки «ответ на» (#56, Р5; JWZ/RFC 5256)', () => {
  it('кандидаты: с КОНЦА References (ближайший предок), In-Reply-To доклеивается, дедуп', () => {
    const candidates = threadCandidates('in-reply@x', ['old@x', 'mid@x', 'new@x', 'new@x']);
    // Родитель = последний ID References (JWZ); In-Reply-To — ближайший
    // предок, впереди разворота.
    expect(candidates).toEqual(['in-reply@x', 'new@x', 'mid@x', 'old@x']);
    expect(threadCandidates(null, ['a@x'])).toEqual(['a@x']);
    expect(threadCandidates('b@x', ['a@x', 'b@x'])).toEqual(['b@x', 'a@x']);
    expect(threadCandidates(null, [])).toEqual([]);
  });

  it('кап 100 кандидатов (LETTER_LIMITS.mailReferences)', () => {
    const many = Array.from({ length: 130 }, (_, i) => `ref-${i}@x`);
    expect(threadCandidates(null, many)).toHaveLength(100);
    expect(threadCandidates(null, many)[0]).toBe('ref-129@x');
  });

  it('авто-связь: первый известный Message-ID от ближайшего предка; надгробия вне', async () => {
    const repo = {
      findByMailMessageIds: async (ids: readonly string[]) =>
        ids.includes('mid@x')
          ? [{ id: 'letter-2', regNumber: 'Исх-2026/2', subject: 'Тема', mailMessageId: 'mid@x' }]
          : [],
      findRegisteredOutgoingByNumber: async () => null,
    } as unknown as LettersRepository;
    const service = new LetterThreadingService(repo);
    const target = await service.autoReplyTarget('in-reply@x', ['old@x', 'mid@x']);
    expect(target?.id).toBe('letter-2');
    expect(await service.autoReplyTarget('unknown@x', null)).toBeNull();
  });

  it('тема → номер исходящего: «Исх-2026/45», «Исх/45» (год текущий), «на № 45 от 24.10.2026»', () => {
    expect(subjectOutgoingNumber('RE: Исх-2026/45 оферта', '2026-10-28')).toBe('Исх-2026/45');
    expect(subjectOutgoingNumber('Ответ на Исх/45', '2026-10-28')).toBe('Исх-2026/45');
    expect(subjectOutgoingNumber('на № 45 от 24.10.2026', '2026-10-28')).toBe('Исх-2026/45');
    // Год из даты темы, не текущий.
    expect(subjectOutgoingNumber('на № 7 от 30.12.2025', '2026-01-02')).toBe('Исх-2025/7');
    expect(subjectOutgoingNumber('Приглашение на совещание', '2026-10-28')).toBeNull();
    expect(subjectOutgoingNumber(null, '2026-10-28')).toBeNull();
  });

  it('подсказка по теме — ровно одно совпадение номера среди исходящих', async () => {
    const repo = {
      findByMailMessageIds: async () => [],
      findRegisteredOutgoingByNumber: async (regNumber: string) =>
        regNumber === 'Исх-2026/45' ? ref('45') : null,
    } as unknown as LettersRepository;
    const service = new LetterThreadingService(repo);
    expect(
      (await service.suggestionBySubject('на № 45 от 24.10.2026', '2026-10-28'))?.regNumber,
    ).toBe('Исх-2026/45');
    expect(await service.suggestionBySubject('без номера', '2026-10-28')).toBeNull();
  });
});
