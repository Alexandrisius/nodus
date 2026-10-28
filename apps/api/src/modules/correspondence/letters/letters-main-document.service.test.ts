import { describe, expect, it, vi } from 'vitest';
import { Permission, type AuthUser } from '@nodus/contracts';

import { LettersMainDocumentService } from './letters-main-document.service.js';
import type { LetterDetailRow } from './letter-row.js';

const LETTER = '00000000-0000-4000-8000-000000000401';
const REGISTRAR = {
  id: '00000000-0000-4000-8000-000000000402',
  displayName: 'Канцелярия',
  permissions: [Permission.CORRESPONDENCE_REGISTER],
} as unknown as AuthUser;
const EMPLOYEE = {
  id: '00000000-0000-4000-8000-000000000403',
  displayName: 'Сотрудник',
  permissions: [],
} as unknown as AuthUser;

const row = (registeredAt: Date | null): LetterDetailRow =>
  ({
    id: LETTER,
    registeredAt,
    addresseeId: null,
    counterpartyId: null,
  }) as unknown as LetterDetailRow;

function setup(letter: LetterDetailRow) {
  const repo = {
    lock: vi.fn(async () => void 0),
    attachments: vi.fn(async () => [] as { id: string; role: string; inline: boolean }[]),
    setMainRoles: vi.fn(async () => void 0),
  };
  const query = {
    visibleRow: vi.fn(async () => letter),
    detail: vi.fn(async () => ({ id: LETTER })),
  };
  const eventBus = { emit: vi.fn(async () => void 0) };
  const service = new LettersMainDocumentService(
    repo as never,
    query as never,
    { run: (fn: (tx: unknown) => unknown) => fn({}) } as never,
    eventBus as never,
    { refs: vi.fn(async () => []) } as never,
  );
  return { service, repo, query, eventBus };
}

const att = (id: string, role: string) => ({
  id,
  fileId: `file-${id}`,
  role,
  sortOrder: 0,
  contentId: null,
  inline: false,
});

describe('выбор основного документа звездой («Основной документ письма» #56)', () => {
  it('канцелярия выбирает файл до регистрации: файл → main, прежний main → приложение', async () => {
    const { service, repo, eventBus } = setup(row(null));
    repo.attachments.mockResolvedValueOnce([
      att('old', 'main'),
      att('new', 'attachment'),
      att('body', 'body'),
    ]);
    await service.set(REGISTRAR, LETTER, 'new');
    expect(repo.setMainRoles).toHaveBeenCalledWith(expect.anything(), LETTER, {
      promoteId: 'new',
      demoteIds: ['old'],
    });
    expect(eventBus.emit).toHaveBeenCalled();
  });

  it('звезда на PDF-копии тела: main сбрасывается, роль body_pdf неизменна', async () => {
    const { service, repo } = setup(row(null));
    repo.attachments.mockResolvedValueOnce([att('m', 'main'), att('pdf', 'body_pdf')]);
    await service.set(REGISTRAR, LETTER, 'pdf');
    expect(repo.setMainRoles).toHaveBeenCalledWith(expect.anything(), LETTER, {
      promoteId: undefined,
      demoteIds: ['m'],
    });
  });

  it('после регистрации выбор заморожен', async () => {
    const { service } = setup(row(new Date()));
    await expect(service.set(REGISTRAR, LETTER, 'x')).rejects.toMatchObject({
      code: 'LETTER_NOT_EDITABLE',
    });
  });

  it('текст письма и исходник — не кандидаты; повтор выбора — no-op', async () => {
    const { service, repo } = setup(row(null));
    repo.attachments.mockResolvedValueOnce([att('b', 'body'), att('s', 'source')]);
    await expect(service.set(REGISTRAR, LETTER, 'b')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    repo.attachments.mockResolvedValueOnce([att('same', 'main')]);
    await service.set(REGISTRAR, LETTER, 'same');
    expect(repo.setMainRoles).not.toHaveBeenCalled();
  });

  it('не-канцелярия не выбирает', async () => {
    const { service } = setup(row(null));
    await expect(service.set(EMPLOYEE, LETTER, 'x')).rejects.toMatchObject({
      code: 'LETTER_NOT_EDITABLE',
    });
  });
});
