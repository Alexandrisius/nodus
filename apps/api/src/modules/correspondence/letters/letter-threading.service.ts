import { Injectable } from '@nestjs/common';
import { LETTER_LIMITS, type LetterRef } from '@nodus/contracts';

import { LettersRepository } from './letters.repository.js';

/**
 * Цепочки «ответ на» (#56, Р5): как почтовые клиенты склеивают переписку —
 * JWZ threading / RFC 5256: References — предки от старых к новым, родитель =
 * ПОСЛЕДНИЙ id (ближайший предок); In-Reply-To доклеивается в хвост, если
 * его нет в References. Нечёткая подсказка — по теме письма: «Исх[-ГГГГ]/N»
 * и «на № N от ДД.ММ.ГГГГ» (год — из даты темы, иначе текущий Минска).
 */

/** Кандидаты цепочки: объединение с дедупом, ПОРЯДОК — от ближайшего предка
 *  к дальнему (References от старых к новым, значит разворот; In-Reply-To —
 *  ближайший предок, JWZ доклеивает его в хвост References, если нет);
 *  кап — LETTER_LIMITS.mailReferences. */
export function threadCandidates(inReplyTo: string | null, references: unknown): string[] {
  const list = Array.isArray(references)
    ? references.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const fromNearest = [
    ...(inReplyTo && !list.includes(inReplyTo) ? [inReplyTo] : []),
    ...[...list].reverse(),
  ];
  return [...new Set(fromNearest)].slice(0, LETTER_LIMITS.mailReferences);
}

/** Разбор темы в номер исходящего «Исх-ГГГГ/N» или null. */
export function subjectOutgoingNumber(subject: string | null, today: string): string | null {
  if (!subject) return null;
  const ex = subject.match(/исх(?:\s*[-–]?\s*(\d{4}))?\s*\/\s*(\d{1,5})/i);
  if (ex) return `Исх-${ex[1] ?? today.slice(0, 4)}/${Number(ex[2])}`;
  const on = subject.match(/на\s*№\s*(\d{1,5})\s*от\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  if (on) return `Исх-${on[4]}/${Number(on[1])}`;
  return null;
}

@Injectable()
export class LetterThreadingService {
  constructor(private readonly repo: LettersRepository) {}

  /** Цель авто-связи при приёме письма: ближайший предок с известным
   *  Message-ID (надгробия спама исключены — к удалённому не цепляемся). */
  async autoReplyTarget(inReplyTo: string | null, references: unknown): Promise<LetterRef | null> {
    const candidates = threadCandidates(inReplyTo, references);
    if (candidates.length === 0) return null;
    const found = await this.repo.findByMailMessageIds(candidates);
    const byMessageId = new Map(found.map((row) => [row.mailMessageId, row]));
    for (const id of candidates) {
      const row = byMessageId.get(id);
      if (row) return { id: row.id, regNumber: row.regNumber, subject: row.subject };
    }
    return null;
  }

  /** Нечёткая подсказка по теме (Р5): ровно одно совпадение номера среди
   *  зарегистрированных исходящих; несколько — подсказки нет (Вика решит). */
  async suggestionBySubject(subject: string | null, today: string): Promise<LetterRef | null> {
    const regNumber = subjectOutgoingNumber(subject, today);
    if (!regNumber) return null;
    return this.repo.findRegisteredOutgoingByNumber(regNumber);
  }
}
