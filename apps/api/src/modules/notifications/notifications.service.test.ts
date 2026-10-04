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
