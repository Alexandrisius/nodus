import type { LetterHistoryEntry } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { letterStages } from './letter-catalog.js';
import { lid } from './letter-ids.js';
import type { DemoLetter } from './letters-model.js';
import { userIds, userRef } from './users.js';

/** Журнал писем (event log по агрегату `letter`, Р11): поступление и
 *  регистрация у всех, у Вх-2026/115 — правка и присоединения, у
 *  Вх-2026/112 — отмена регистрации с причиной. Новые записи — сверху. */
export function seedHistory(letters: readonly DemoLetter[]): Map<string, LetterHistoryEntry[]> {
  const history = new Map<string, LetterHistoryEntry[]>();
  const karpovich = userRef(userIds.karpovich);
  for (const letter of letters) {
    const entries: LetterHistoryEntry[] = [
      {
        id: crypto.randomUUID(),
        kind: 'received',
        at: letter.receivedAt,
        actor: letter.source === 'manual' ? karpovich : null,
        source: letter.source,
      },
    ];
    if (letter.registeredAt && letter.regNumber) {
      entries.unshift({
        id: crypto.randomUUID(),
        kind: 'registered',
        at: letter.registeredAt,
        actor: karpovich,
        regNumber: letter.regNumber,
      });
    }
    history.set(letter.id, entries);
  }
  history.get(lid(3))?.unshift(
    {
      id: crypto.randomUUID(),
      kind: 'participant_joined',
      at: isoAgo(2, 9, 25),
      actor: userRef(userIds.matorin),
    },
    {
      id: crypto.randomUUID(),
      kind: 'participant_joined',
      at: isoAgo(3, 9, 5),
      actor: userRef(userIds.vinnichek),
    },
    {
      id: crypto.randomUUID(),
      kind: 'updated',
      at: isoAgo(4, 12, 10),
      actor: karpovich,
      changes: [
        { field: 'theirNumber', from: '0359-КЖ/14', to: '0359-КЖ/147' },
        { field: 'responseDeadline', from: null, to: isoDateIn(-1) },
      ],
    },
  );
  history.get(lid(6))?.unshift({
    id: crypto.randomUUID(),
    kind: 'stage_changed',
    at: isoAgo(4, 11, 20),
    actor: karpovich,
    transitionName: 'Отменить регистрацию',
    fromStageName: letterStages.onResolution.name,
    toStageName: letterStages.registeredByMistake.name,
    comment: MISTAKE_REASON,
  });
  return history;
}

/** Причина отмены регистрации Вх-2026/112 (журнал и блок в чате письма). */
export const MISTAKE_REASON =
  'Это счёт-фактура для бухгалтерии, а не письмо в адрес директора — оригинал передан в бухгалтерию.';
