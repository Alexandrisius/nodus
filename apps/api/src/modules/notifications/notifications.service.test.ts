import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, type UserRef } from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';
import { NotificationsService } from './notifications.service.js';

const AUTHOR = '22222222-2222-2222-2222-222222222222';
const RECIPIENT = '33333333-3333-3333-3333-333333333333';
const MSG = '44444444-4444-4444-4444-444444444444';

const AUTHOR_REF: UserRef = { id: AUTHOR, displayName: 'Автор', avatarUrl: null };
const RECIPIENT_REF: UserRef = { id: RECIPIENT, displayName: 'Получатель', avatarUrl: null };

describe('NotificationsService.urgentAcks (#202: доступ только автору срочного)', () => {
  const repo = {
    urgentAuthorId: vi.fn(),
    urgentAcks: vi.fn(),
  };
  const userProfiles = { findRefs: vi.fn() };
  let service: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationsService(
      repo as never,
      {} as never,
      {} as never,
      userProfiles as never,
      {} as never,
    );
  });

  it('автор срочного — статус «Ознакомились N из M» с гидратацией профилей', async () => {
    const ackedAt = new Date('2026-10-04T10:00:00Z');
    repo.urgentAuthorId.mockResolvedValue(AUTHOR);
    repo.urgentAcks.mockResolvedValue({ rows: [{ userId: RECIPIENT, ackedAt }], expected: 3 });
    userProfiles.findRefs.mockResolvedValue([RECIPIENT_REF]);

    const status = await service.urgentAcks(AUTHOR, MSG);

    expect(status).toEqual({
      messageId: MSG,
      ackedCount: 1,
      expectedCount: 3,
      items: [{ user: RECIPIENT_REF, ackedAt: ackedAt.toISOString() }],
    });
  });

  it('не-автор (получатель срочного) — NOT_FOUND, данные не читаются', async () => {
    repo.urgentAuthorId.mockResolvedValue(AUTHOR);

    await expect(service.urgentAcks(RECIPIENT, MSG)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(repo.urgentAcks).not.toHaveBeenCalled();
    expect(userProfiles.findRefs).not.toHaveBeenCalled();
  });

  it('несуществующий messageId (нет срочных строк) — NOT_FOUND', async () => {
    repo.urgentAuthorId.mockResolvedValue(null);

    await expect(service.urgentAcks(AUTHOR, MSG)).rejects.toBeInstanceOf(DomainException);
    await expect(service.urgentAcks(AUTHOR, MSG)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('профиль ознакомившегося не найден — фолбэк «—», не 500', async () => {
    repo.urgentAuthorId.mockResolvedValue(AUTHOR);
    repo.urgentAcks.mockResolvedValue({
      rows: [{ userId: RECIPIENT, ackedAt: new Date() }],
      expected: 1,
    });
    userProfiles.findRefs.mockResolvedValue([AUTHOR_REF]);

    const status = await service.urgentAcks(AUTHOR, MSG);

    expect(status.items[0]!.user).toEqual({ id: RECIPIENT, displayName: '—', avatarUrl: null });
  });
});

describe('NotificationsService: ack из пузыря (#177)', () => {
  const row = {
    id: 'notif-1',
    message_id: MSG,
    priority: 'urgent',
    require_ack: true,
    ack_at: null,
    read_at: null,
  };
  const repo = {
    findByMessage: vi.fn(),
    ack: vi.fn(),
    urgentAcks: vi.fn(),
    urgentAuthorId: vi.fn(),
    toDtos: vi.fn(),
  };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb('tx')) };
  const eventBus = { emit: vi.fn() };
  const userProfiles = { findRefs: vi.fn() };
  let service: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationsService(
      repo as never,
      txRunner as never,
      eventBus as never,
      userProfiles as never,
      {} as never,
    );
  });

  it('своя requireAck-строка — штатный ack по id строки журнала', async () => {
    repo.findByMessage.mockResolvedValue(row);
    repo.ack.mockResolvedValue({ ...row, ack_at: new Date('2026-10-04T11:00:00Z') });
    repo.urgentAcks.mockResolvedValue({ rows: [], expected: 1 });
    repo.urgentAuthorId.mockResolvedValue(AUTHOR);
    repo.toDtos.mockResolvedValue([{ id: row.id }]);

    await service.ackByMessage(RECIPIENT, MSG);

    expect(repo.ack).toHaveBeenCalledWith(RECIPIENT, row.id);
  });

  it('не моя / не requireAck строка — NOT_FOUND (G3)', async () => {
    repo.findByMessage.mockResolvedValue(null);
    await expect(service.ackByMessage(RECIPIENT, MSG)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(repo.ack).not.toHaveBeenCalled();
  });

  it('selfAck: своё — ackedAt из строки, ещё не ознакомлен — null', async () => {
    repo.findByMessage.mockResolvedValue(row);
    await expect(service.selfAck(RECIPIENT, MSG)).resolves.toEqual({
      messageId: MSG,
      ackedAt: null,
    });
    repo.findByMessage.mockResolvedValue({ ...row, ack_at: new Date('2026-10-04T11:00:00Z') });
    await expect(service.selfAck(RECIPIENT, MSG)).resolves.toEqual({
      messageId: MSG,
      ackedAt: '2026-10-04T11:00:00.000Z',
    });
  });

  it('selfAck: не моя строка — NOT_FOUND', async () => {
    repo.findByMessage.mockResolvedValue(null);
    await expect(service.selfAck(RECIPIENT, MSG)).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
