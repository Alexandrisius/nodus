import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(authorization?: string) {
  const request: Record<string, unknown> = { headers: { authorization } };
  return {
    request,
    context: {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

function makeGuard(revoked: boolean) {
  const tokenService = {
    verifyAccessToken: vi.fn(async () => ({
      sub: 'u1',
      email: 'u1@nodus.by',
      displayName: 'Сотрудник',
      permissions: [],
      sid: 's1',
      iat: 1000,
    })),
  };
  const reflector = { getAllAndOverride: vi.fn(() => false) };
  const revokedUsers = { isRevoked: vi.fn(async () => revoked) };
  return {
    guard: new JwtAuthGuard(tokenService as never, reflector as never, revokedUsers as never),
    revokedUsers,
  };
}

/** Стоп-лист уволенных в глобальном guard (#333). */
describe('JwtAuthGuard', () => {
  it('валидный токен уволенного (выдан до деактивации) → UNAUTHENTICATED', async () => {
    const { guard, revokedUsers } = makeGuard(true);
    await expect(guard.canActivate(makeContext('Bearer t').context)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHENTICATED,
    });
    expect(revokedUsers.isRevoked).toHaveBeenCalledWith('u1', 1000);
  });

  it('не отозван → пропуск, AuthUser в request', async () => {
    const { guard } = makeGuard(false);
    const { context, request } = makeContext('Bearer t');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(Object.values(request).some((v) => (v as { id?: string })?.id === 'u1')).toBe(true);
  });
});
