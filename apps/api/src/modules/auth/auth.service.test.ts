import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { AuthService } from './auth.service.js';

const IDENTITY = {
  id: 'user-1',
  email: 'a@b.by',
  displayName: 'Иванов Иван',
  status: 'active' as const,
  permissions: ['directory.read'],
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'a'.repeat(64),
    previousRefreshTokenHash: null,
    userAgent: 'agent',
    ip: '127.0.0.1',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  const authProvider = { verifyCredentials: vi.fn() };
  const authRepository = {
    findCredentialsByEmail: vi.fn(),
    findIdentityById: vi.fn(),
    updatePassword: vi.fn(),
    createSession: vi.fn(),
    findSessionById: vi.fn(),
    rotateSession: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
    listActiveSessions: vi.fn(),
  };
  const passwordService = { verify: vi.fn(), hash: vi.fn(), needsRehash: vi.fn() };
  const tokenService = {
    config: { accessTtlSeconds: 900, refreshTtlDays: 30 },
    signAccessToken: vi.fn().mockResolvedValue('access-jwt'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'raw-token', hash: 'b'.repeat(64) }),
    hashRefreshToken: vi.fn().mockReturnValue('a'.repeat(64)),
    hashesEqual: vi.fn((a: string, b: string) => a === b),
    parseRefreshCookie: vi.fn((raw?: string) =>
      raw ? { sessionId: 'session-1', token: 'raw-token' } : null,
    ),
  };
  const audit = { append: vi.fn() };

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks не сбрасывает реализации — возвращаем дефолты явно.
    tokenService.hashesEqual.mockImplementation((a: string, b: string) => a === b);
    tokenService.parseRefreshCookie.mockImplementation((raw?: string) =>
      raw ? { sessionId: 'session-1', token: 'raw-token' } : null,
    );
    service = new AuthService(
      authProvider as never,
      authRepository as never,
      passwordService as never,
      tokenService as never,
      audit as never,
    );
  });

  describe('login', () => {
    it('неверные креды → AUTH_INVALID_CREDENTIALS + аудит login_failed', async () => {
      authProvider.verifyCredentials.mockResolvedValue(null);

      await expect(service.login('a@b.by', 'bad', '1.1.1.1', 'ua')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
      expect(audit.append).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login_failed', details: { email: 'a@b.by' } }),
      );
      expect(authRepository.createSession).not.toHaveBeenCalled();
    });

    it('успех → сессия + access-токен', async () => {
      authProvider.verifyCredentials.mockResolvedValue(IDENTITY);
      authRepository.createSession.mockResolvedValue(makeSession());

      const result = await service.login('a@b.by', 'ok', '1.1.1.1', 'ua');

      expect(result.accessToken).toBe('access-jwt');
      expect(result.refreshToken).toBe('raw-token');
      expect(result.expiresIn).toBe(900);
      expect(authRepository.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', refreshTokenHash: 'b'.repeat(64) }),
      );
    });
  });

  describe('refresh (ротация)', () => {
    it('нет cookie → AUTH_SESSION_INVALID', async () => {
      await expect(service.refresh(undefined, '1.1.1.1', 'ua')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
    });

    it('отозванная сессия → AUTH_SESSION_INVALID', async () => {
      authRepository.findSessionById.mockResolvedValue(makeSession({ revokedAt: new Date() }));

      await expect(service.refresh('cookie', '1.1.1.1', 'ua')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
    });

    it('reuse сменённого токена → отзыв сессии + аудит + 401', async () => {
      const session = makeSession({ previousRefreshTokenHash: 'a'.repeat(64) });
      authRepository.findSessionById.mockResolvedValue(session);

      await expect(service.refresh('cookie', '1.1.1.1', 'ua')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
      expect(authRepository.revokeSession).toHaveBeenCalledWith('session-1');
      expect(audit.append).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.session_reuse_detected' }),
      );
    });

    it('чужой токен на валидной сессии → 401 без отзыва', async () => {
      authRepository.findSessionById.mockResolvedValue(makeSession());
      tokenService.hashesEqual.mockReturnValue(false);

      await expect(service.refresh('cookie', '1.1.1.1', 'ua')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
      expect(authRepository.revokeSession).not.toHaveBeenCalled();
    });

    it('валидный токен → ротация и новая пара', async () => {
      authRepository.findSessionById.mockResolvedValue(makeSession());
      authRepository.findIdentityById.mockResolvedValue(IDENTITY);

      const result = await service.refresh('cookie', '1.1.1.1', 'ua');

      expect(result.accessToken).toBe('access-jwt');
      expect(authRepository.rotateSession).toHaveBeenCalledWith(
        'session-1',
        'b'.repeat(64),
        'a'.repeat(64),
        expect.any(Date),
      );
    });

    it('деактивированный пользователь → отзыв сессии + 401', async () => {
      authRepository.findSessionById.mockResolvedValue(makeSession());
      authRepository.findIdentityById.mockResolvedValue({ ...IDENTITY, status: 'deactivated' });

      await expect(service.refresh('cookie', '1.1.1.1', 'ua')).rejects.toMatchObject({
        code: ErrorCode.AUTH_SESSION_INVALID,
      });
      expect(authRepository.revokeSession).toHaveBeenCalledWith('session-1');
    });
  });

  describe('logout', () => {
    it('идемпотентен: нет cookie / нет сессии / чужой токен — тихо', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      authRepository.findSessionById.mockResolvedValue(null);
      await expect(service.logout('cookie')).resolves.toBeUndefined();
      authRepository.findSessionById.mockResolvedValue(makeSession());
      tokenService.hashesEqual.mockReturnValue(false);
      await expect(service.logout('cookie')).resolves.toBeUndefined();
      expect(authRepository.revokeSession).not.toHaveBeenCalled();
    });

    it('валидный токен → отзыв', async () => {
      authRepository.findSessionById.mockResolvedValue(makeSession());
      await service.logout('cookie');
      expect(authRepository.revokeSession).toHaveBeenCalledWith('session-1');
    });
  });

  describe('changePassword', () => {
    it('неверный старый пароль → AUTH_INVALID_CREDENTIALS', async () => {
      authRepository.findIdentityById.mockResolvedValue(IDENTITY);
      authRepository.findCredentialsByEmail.mockResolvedValue({
        ...IDENTITY,
        passwordHash: 'hash',
      });
      passwordService.verify.mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', 'bad', 'New!234567890', 's1'),
      ).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    });

    it('успех → перехэш + отзыв всех сессий кроме текущей', async () => {
      authRepository.findIdentityById.mockResolvedValue(IDENTITY);
      authRepository.findCredentialsByEmail.mockResolvedValue({
        ...IDENTITY,
        passwordHash: 'hash',
      });
      passwordService.verify.mockResolvedValue(true);
      passwordService.hash.mockResolvedValue('new-hash');

      await service.changePassword('user-1', 'old', 'New!234567890', 'session-1');

      expect(authRepository.updatePassword).toHaveBeenCalledWith('user-1', 'new-hash');
      expect(authRepository.revokeAllSessions).toHaveBeenCalledWith('user-1', 'session-1');
    });
  });
});
