import { CORRESPONDENCE_EVENTS } from '@nodus/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  LetterDeletedUsageHandler,
  LetterRegisteredUsageHandler,
  LetterUpdatedUsageHandler,
} from './letter-usage.handler.js';

const LETTER = '00000000-0000-4000-8000-000000000301';
const CP = '00000000-0000-4000-8000-000000000302';
const SIGNER = '00000000-0000-4000-8000-000000000303';

const event = (payload: Record<string, unknown>) =>
  ({
    id: 'e1',
    type: CORRESPONDENCE_EVENTS.LETTER_REGISTERED,
    payload,
    actorId: null,
  }) as never;

function usages() {
  return {
    upsertLetter: vi.fn(async () => void 0),
    updateLetterContact: vi.fn(async () => void 0),
    deleteLetter: vi.fn(async () => void 0),
    findLetter: vi.fn(async () => ({ counterpartyId: CP, contactId: SIGNER })),
  };
}

describe('проекция «письма контрагента» (#55, B6)', () => {
  it('регистрация пишет строку с подписантом', async () => {
    const repo = usages();
    await new LetterRegisteredUsageHandler(repo as never).handle(
      event({ letterId: LETTER, counterpartyId: CP, signerId: SIGNER }),
    );
    expect(repo.upsertLetter).toHaveBeenCalledWith({
      sourceId: LETTER,
      counterpartyId: CP,
      contactId: SIGNER,
    });
  });

  it('правка только подписанта не трогает корреспондента', async () => {
    const repo = usages();
    await new LetterUpdatedUsageHandler(repo as never).handle(
      event({ letterId: LETTER, changes: [], signerId: null }),
    );
    expect(repo.updateLetterContact).toHaveBeenCalledWith(LETTER, null);
    expect(repo.upsertLetter).not.toHaveBeenCalled();
  });

  it('смена корреспондента без подписанта сохраняет прежнего', async () => {
    const repo = usages();
    await new LetterUpdatedUsageHandler(repo as never).handle(
      event({ letterId: LETTER, changes: [], counterpartyId: CP }),
    );
    expect(repo.upsertLetter).toHaveBeenCalledWith({
      sourceId: LETTER,
      counterpartyId: CP,
      contactId: SIGNER,
    });
  });

  it('удаление спама убирает строку', async () => {
    const repo = usages();
    await new LetterDeletedUsageHandler(repo as never).handle(event({ letterId: LETTER }));
    expect(repo.deleteLetter).toHaveBeenCalledWith(LETTER);
  });
});
