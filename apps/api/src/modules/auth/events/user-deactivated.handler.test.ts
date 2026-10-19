import { describe, expect, it, vi } from 'vitest';

import { UserDeactivatedHandler } from './user-deactivated.handler.js';

/** Деактивация: стоп-лист access-токенов (момент события) + отзыв сессий (#333). */
describe('UserDeactivatedHandler', () => {
  it('стоп-лист с моментом createdAt события и отзыв сессий', async () => {
    const repo = { revokeAllSessions: vi.fn() };
    const revoked = { revoke: vi.fn() };
    const handler = new UserDeactivatedHandler(repo as never, revoked as never);
    await handler.handle({
      id: 'e1',
      type: 'directory.user.deactivated',
      actorId: 'admin',
      payload: { userId: 'u1' },
      createdAt: '2026-10-19T10:00:00.000Z',
    });
    expect(revoked.revoke).toHaveBeenCalledWith('u1', new Date('2026-10-19T10:00:00.000Z'));
    expect(repo.revokeAllSessions).toHaveBeenCalledWith('u1');
  });
});
