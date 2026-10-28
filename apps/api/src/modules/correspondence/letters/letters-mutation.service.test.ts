import { describe, expect, it, vi } from 'vitest';
import { Permission, type AuthUser } from '@nodus/contracts';

import { LettersMutationService } from './letters-mutation.service.js';
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
const COLLEAGUE = '00000000-0000-4000-8000-000000000404';

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
    addParticipant: vi.fn(async () => true),
    markViewed: vi.fn(async () => void 0),
    update: vi.fn(async () => void 0),
    attachments: vi.fn(
      async (): Promise<
        {
          id: string;
          fileId: string;
          role: string;
          sortOrder: number;
          contentId: null;
          inline: boolean;
        }[]
      > => [],
    ),
    setMainRoles: vi.fn(async () => void 0),
  };
  const query = {
    visibleRow: vi.fn(async () => letter),
    detail: vi.fn(async () => ({ id: LETTER })),
  };
  const validator = { patch: vi.fn(async () => ({ data: {}, changes: [] })) };
  const eventBus = { emit: vi.fn(async () => void 0) };
  const profiles = { filterActiveUserIds: vi.fn(async (ids: string[]) => ids) };
  const service = new LettersMutationService(
    repo as never,
    query as never,
    validator as never,
    { run: (fn: (tx: unknown) => unknown) => fn({}) } as never,
    eventBus as never,
    {} as never,
    { refs: vi.fn(async () => []) } as never,
    {} as never,
    profiles as never,
  );
  return { service, repo, query, validator, eventBus, profiles };
}

describe('правка реквизитов (редизайн #56 — карточка = форма)', () => {
  it('канцелярия правит и незарегистрированное письмо', async () => {
    const { service, validator } = setup(row(null));
    await service.update(REGISTRAR, LETTER, { subject: 'Оферт' });
    expect(validator.patch).toHaveBeenCalled();
  });

  it('не-канцелярия не правит даже зарегистрированное', async () => {
    const { service } = setup(row(new Date()));
    await expect(service.update(EMPLOYEE, LETTER, { subject: 'x' })).rejects.toMatchObject({
      code: 'LETTER_NOT_EDITABLE',
    });
  });

  it('адресат не меняется после регистрации', async () => {
    const { service, validator } = setup(row(new Date()));
    await expect(
      service.update(REGISTRAR, LETTER, { addresseeId: COLLEAGUE }),
    ).rejects.toMatchObject({ code: 'LETTER_NOT_EDITABLE' });
    expect(validator.patch).not.toHaveBeenCalled();
  });

  it('адресат незарегистрированного проходит до валидации ссылки', async () => {
    const { service, validator } = setup(row(null));
    await service.update(REGISTRAR, LETTER, { addresseeId: COLLEAGUE });
    expect(validator.patch).toHaveBeenCalled();
  });
});

describe('выбор основного документа звездой («Основной документ письма» #56)', () => {
  const att = (id: string, role: string) => ({
    id,
    fileId: `file-${id}`,
    role,
    sortOrder: 0,
    contentId: null,
    inline: false,
  });

  it('канцелярия выбирает файл до регистрации: файл → main, прежний main → приложение', async () => {
    const { service, repo, eventBus } = setup(row(null));
    repo.attachments.mockResolvedValueOnce([
      att('old', 'main'),
      att('new', 'attachment'),
      att('body', 'body'),
    ]);
    await service.setMainDocument(REGISTRAR, LETTER, 'new');
    expect(repo.setMainRoles).toHaveBeenCalledWith(expect.anything(), LETTER, {
      promoteId: 'new',
      demoteIds: ['old'],
    });
    expect(eventBus.emit).toHaveBeenCalled();
  });

  it('звезда на PDF-копии тела: main сбрасывается, роль body_pdf неизменна', async () => {
    const { service, repo } = setup(row(null));
    repo.attachments.mockResolvedValueOnce([att('m', 'main'), att('pdf', 'body_pdf')]);
    await service.setMainDocument(REGISTRAR, LETTER, 'pdf');
    expect(repo.setMainRoles).toHaveBeenCalledWith(expect.anything(), LETTER, {
      promoteId: undefined,
      demoteIds: ['m'],
    });
  });

  it('после регистрации выбор заморожен', async () => {
    const { service } = setup(row(new Date()));
    await expect(service.setMainDocument(REGISTRAR, LETTER, 'x')).rejects.toMatchObject({
      code: 'LETTER_NOT_EDITABLE',
    });
  });

  it('текст письма и исходник — не кандидаты; повтор выбора — no-op', async () => {
    const { service, repo } = setup(row(null));
    repo.attachments.mockResolvedValueOnce([att('b', 'body'), att('s', 'source')]);
    await expect(service.setMainDocument(REGISTRAR, LETTER, 'b')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    repo.attachments.mockResolvedValueOnce([att('same', 'main')]);
    await service.setMainDocument(REGISTRAR, LETTER, 'same');
    expect(repo.setMainRoles).not.toHaveBeenCalled();
  });

  it('не-канцелярия не выбирает', async () => {
    const { service } = setup(row(null));
    await expect(service.setMainDocument(EMPLOYEE, LETTER, 'x')).rejects.toMatchObject({
      code: 'LETTER_NOT_EDITABLE',
    });
  });
});

describe('обсуждение незарегистрированного письма (редизайн #56)', () => {
  it('канцелярия начинает обсуждение join-ом', async () => {
    const { service, repo, eventBus } = setup(row(null));
    await service.join(REGISTRAR, LETTER);
    expect(repo.addParticipant).toHaveBeenCalledWith(expect.anything(), LETTER, REGISTRAR.id);
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('сотруднику незарегистрированное — 404', async () => {
    const { service, repo } = setup(row(null));
    await expect(service.join(EMPLOYEE, LETTER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.addParticipant).not.toHaveBeenCalled();
  });

  it('приглашение коллеги: активный — участник + событие, повтор — без события', async () => {
    const { service, repo, eventBus } = setup(row(null));
    await service.addParticipant(REGISTRAR, LETTER, COLLEAGUE);
    expect(repo.addParticipant).toHaveBeenCalledWith(expect.anything(), LETTER, COLLEAGUE);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.anything(),
      'correspondence.letter_participants_changed',
      { letterId: LETTER, added: [COLLEAGUE], removed: [] },
      expect.anything(),
    );
    repo.addParticipant.mockResolvedValue(false);
    await service.addParticipant(REGISTRAR, LETTER, COLLEAGUE);
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('приглашение уволенного/несуществующего — 404', async () => {
    const { service, repo, profiles } = setup(row(new Date()));
    profiles.filterActiveUserIds.mockResolvedValue([]);
    await expect(service.addParticipant(REGISTRAR, LETTER, COLLEAGUE)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.addParticipant).not.toHaveBeenCalled();
  });
});

describe('личный признак «просмотрено» (редизайн #56)', () => {
  it('открытие карточки пишет строку letter_views', async () => {
    const { service, repo } = setup(row(null));
    await service.markViewed(REGISTRAR, LETTER);
    expect(repo.markViewed).toHaveBeenCalledWith(LETTER, REGISTRAR.id);
  });
});
