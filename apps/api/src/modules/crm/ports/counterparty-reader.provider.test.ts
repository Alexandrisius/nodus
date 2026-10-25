import { describe, expect, it, vi } from 'vitest';

import { CounterpartyReaderProvider } from './counterparty-reader.provider.js';

const ID = '00000000-0000-4000-8000-000000000301';

describe('CounterpartyReaderProvider (#460, ADR-0012)', () => {
  it('refs: пустой вход — без запроса; name — краткое название', async () => {
    const repo = { findRefs: vi.fn().mockResolvedValue([{ id: ID, shortName: 'ООО «Тест»' }]) };
    const provider = new CounterpartyReaderProvider(repo as never);

    expect(await provider.refs([])).toEqual([]);
    expect(repo.findRefs).not.toHaveBeenCalled();

    expect(await provider.refs([ID])).toEqual([{ id: ID, name: 'ООО «Тест»' }]);
  });

  it('activeRef: архивный или отсутствующий контрагент — null', async () => {
    const repo = { findActiveRef: vi.fn().mockResolvedValue(null) };
    const provider = new CounterpartyReaderProvider(repo as never);
    expect(await provider.activeRef(ID)).toBeNull();

    repo.findActiveRef.mockResolvedValue({ id: ID, shortName: 'ООО «Тест»' });
    expect(await provider.activeRef(ID)).toEqual({ id: ID, name: 'ООО «Тест»' });
  });
});
