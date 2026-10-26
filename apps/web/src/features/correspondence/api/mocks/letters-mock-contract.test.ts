import { describe, expect, it } from 'vitest';
import {
  Permission,
  chatMessageBlockSchema,
  checkWorkflowDocument,
  executeTransitionBodySchema,
  hasBlockingProblems,
  letterDetailSchema,
  letterHistoryEntrySchema,
  letterListItemSchema,
  workflowDocumentSchema,
} from '@nodus/contracts';

import { letterMessages } from '../../../../shared/mocks/data/chat-letters.js';
import {
  incomingLetterDocument,
  outgoingLetterDocument,
} from '../../../../shared/mocks/data/letter-catalog.js';
import {
  boxOf,
  demoLetters,
  letterDetailOf,
  letterHistory,
  letterListItemOf,
  nextLetterNumber,
} from '../../../../shared/mocks/data/letters.js';
import { registrationIssueOf } from './letters-mock-checks.js';
import { letterTransitionsOf } from './letters-transition-handlers.js';

const registrar = { id: 'u-office', permissions: [Permission.CORRESPONDENCE_REGISTER] };
const employee = { id: 'u-employee', permissions: [Permission.DIRECTORY_READ] };

describe('мок-мир писем v3 (#55, §7.6) парсится контрактами', () => {
  it('каждое письмо — валидный элемент списка и карточка', () => {
    for (const letter of demoLetters) {
      expect(() => letterListItemSchema.parse(letterListItemOf(letter))).not.toThrow();
      expect(() => letterDetailSchema.parse(letterDetailOf(letter, registrar))).not.toThrow();
    }
  });

  it('журнал и блок причины в чате — по контрактам', () => {
    for (const entries of letterHistory.values()) {
      for (const entry of entries)
        expect(() => letterHistoryEntrySchema.parse(entry)).not.toThrow();
    }
    const blocks = letterMessages.filter((m) => m.block);
    expect(blocks).toHaveLength(1);
    expect(chatMessageBlockSchema.parse(blocks[0]?.block).kind).toBe('letter_transition');
  });

  it('маршруты писем проходят проверку документа категории letter', () => {
    for (const doc of [incomingLetterDocument, outgoingLetterDocument]) {
      expect(() => workflowDocumentSchema.parse(doc)).not.toThrow();
      const problems = checkWorkflowDocument(doc, {
        category: 'letter',
        numberingConfigured: true,
      });
      expect(hasBlockingProblems(problems)).toBe(false);
    }
  });

  it('«Новые» — шесть писем, Вх-2026/108…117 без пропусков, следующий 118', () => {
    expect(demoLetters.filter((l) => boxOf(l) === 'new')).toHaveLength(6);
    const seqs = demoLetters
      .map((l) => Number(l.regNumber?.split('/')[1]))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    expect(seqs).toEqual([108, 109, 110, 111, 112, 113, 114, 115, 116, 117]);
    expect(demoLetters.filter((l) => l.direction === 'outgoing')).toHaveLength(0);
    expect(nextLetterNumber('incoming', new Date(2026, 9, 26))).toBe('Вх-2026/118');
  });

  it('кнопки нового письма — только у держателя права регистрации', () => {
    const fresh = demoLetters.find((l) => boxOf(l) === 'new')!;
    const names = letterTransitionsOf(fresh, registrar).map((t) => t.name);
    expect(names).toEqual(['Зарегистрировать', 'Закрыть без регистрации']);
    expect(letterTransitionsOf(fresh, employee)).toEqual([]);
    expect(letterDetailOf(fresh, registrar).access.canDeleteSpam).toBe(true);
  });

  it('ошибка схемы регистрации → поле и причина 422', () => {
    const parsed = executeTransitionBodySchema.safeParse({
      form: { registration: { counterpartyId: 'x' } },
    });
    expect(parsed.success).toBe(false);
    const issue = parsed.success
      ? null
      : registrationIssueOf(parsed.error, ['form', 'registration']);
    expect(issue?.field).toBe('counterpartyId');
  });
});
