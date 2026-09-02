import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type AuthUser } from '@nodus/contracts';

import { AuditRepository } from '../../core/audit/audit.repository.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { AUTH_PROVIDER, type AuthProvider } from './auth-provider.js';
import { AuthRepository, type SessionRow } from './auth.repository.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { PasswordService } from '../../core/crypto/password.service.js';
import { TokenService } from './token.service.js';

/** Результат успешной аутентификации/ротации — контроллер ставит cookie. */
export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

function toAuthUser(identity: {
  id: string;
  email: string;
  displayName: string;
  permissions: string[];
}): AuthUser {
  return {
    id: identity.id,
    email: identity.email,
    displayName: identity.displayName,
    permissions: identity.permissions,
  };
}

/**
 * Сценарии auth (thin service over AuthProvider + sessions):
 * login → issue, refresh → ротация с reuse-detection, logout/отзывы.
 * HTTP и cookie — только контроллер; Prisma — только репозиторий.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly audit: AuditRepository,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string | null,
  ): Promise<IssuedSession> {
    // Пер-аккаунтный троттлинг (OWASP): 10 неудач за 10 минут → пауза.
    // Ответ — тот же INVALID_CREDENTIALS, чтобы не выдавать факт блокировки.
    if (await this.loginThrottle.isLocked(email)) {
      await this.audit.append({
        actorId: null,
        action: 'auth.login_throttled',
        details: { email },
        ip,
        userAgent: userAgent ?? undefined,
      });
      throw new DomainException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const identity = await this.authProvider.verifyCredentials(email, password);
    if (!identity) {
      await this.loginThrottle.recordFailure(email);
      // Аудит неуспешного входа (перехватчик пишет только успешные ответы).
      await this.audit.append({
        actorId: null,
        action: 'auth.login_failed',
        details: { email },
        ip,
        userAgent: userAgent ?? undefined,
      });
      throw new DomainException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
    }
    await this.loginThrottle.reset(email);

    const { token, hash } = this.tokenService.generateRefreshToken();
    const session = await this.authRepository.createSession({
      userId: identity.id,
      refreshTokenHash: hash,
      userAgent,
      ip,
      expiresAt: this.refreshExpiresAt(),
    });

    const user = toAuthUser(identity);
    const accessToken = await this.tokenService.signAccessToken(user, session.id);
    return {
      sessionId: session.id,
      refreshToken: token,
      accessToken,
      expiresIn: this.tokenService.config.accessTtlSeconds,
      user,
    };
  }

  /**
   * Ротация refresh-токена. Предъявление ПРЕДЫДУЩЕГО (уже сменённого)
   * токена = компрометация: отзыв всей сессии (reuse-detection, подход Auth0).
   */
  async refresh(
    cookieRaw: string | undefined,
    ip: string,
    userAgent: string | null,
  ): Promise<IssuedSession> {
    const parsed = this.tokenService.parseRefreshCookie(cookieRaw);
    if (!parsed) {
      throw this.sessionInvalid();
    }
    const session = await this.authRepository.findSessionById(parsed.sessionId);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw this.sessionInvalid();
    }

    const presentedHash = this.tokenService.hashRefreshToken(parsed.token);
    if (
      session.previousRefreshTokenHash &&
      this.tokenService.hashesEqual(presentedHash, session.previousRefreshTokenHash)
    ) {
      // Reuse сменённого токена: цепочка скомпрометирована — гасим сессию.
      await this.authRepository.revokeSession(session.id);
      await this.audit.append({
        actorId: session.userId,
        action: 'auth.session_reuse_detected',
        entityType: 'session',
        entityId: session.id,
        ip,
        userAgent: userAgent ?? undefined,
      });
      throw this.sessionInvalid();
    }
    if (!this.tokenService.hashesEqual(presentedHash, session.refreshTokenHash)) {
      throw this.sessionInvalid();
    }

    const identity = await this.authRepository.findIdentityById(session.userId);
    if (!identity || identity.status !== 'active') {
      await this.authRepository.revokeSession(session.id);
      throw this.sessionInvalid();
    }

    const { token, hash } = this.tokenService.generateRefreshToken();
    await this.authRepository.rotateSession(
      session.id,
      hash,
      session.refreshTokenHash,
      this.refreshExpiresAt(),
    );

    const user = toAuthUser(identity);
    const accessToken = await this.tokenService.signAccessToken(user, session.id);
    return {
      sessionId: session.id,
      refreshToken: token,
      accessToken,
      expiresIn: this.tokenService.config.accessTtlSeconds,
      user,
    };
  }

  /** Logout: отзыв сессии по refresh-cookie (access мог уже протухнуть). */
  async logout(cookieRaw: string | undefined): Promise<void> {
    const parsed = this.tokenService.parseRefreshCookie(cookieRaw);
    if (!parsed) return; // уже вышел / мусорная cookie — идемпотентно ок
    const session = await this.authRepository.findSessionById(parsed.sessionId);
    if (!session || session.revokedAt) return;
    const presentedHash = this.tokenService.hashRefreshToken(parsed.token);
    if (
      this.tokenService.hashesEqual(presentedHash, session.refreshTokenHash) ||
      (session.previousRefreshTokenHash !== null &&
        this.tokenService.hashesEqual(presentedHash, session.previousRefreshTokenHash))
    ) {
      await this.authRepository.revokeSession(session.id);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.authRepository.revokeAllSessions(userId);
  }

  async listSessions(userId: string, currentSessionId: string | null) {
    const sessions = await this.authRepository.listActiveSessions(userId);
    return sessions.map((s: SessionRow) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  /** Отзыв чужой сессии из списка (свою текущую — только через logout). */
  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string | null,
  ): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new DomainException(ErrorCode.CONFLICT, 'Use logout to end the current session');
    }
    const session = await this.authRepository.findSessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw DomainException.notFound('Session not found');
    }
    await this.authRepository.revokeSession(sessionId);
  }

  /** Смена пароля: проверка старого + отзыв всех остальных сессий. */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    currentSessionId: string | null,
  ): Promise<void> {
    const identity = await this.authRepository.findIdentityById(userId);
    const credentials = identity
      ? await this.authRepository.findCredentialsByEmail(identity.email)
      : null;
    if (!credentials) {
      throw new DomainException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid password');
    }
    const valid = await this.passwordService.verify(credentials.passwordHash, oldPassword);
    if (!valid) {
      throw new DomainException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid password');
    }
    const hash = await this.passwordService.hash(newPassword);
    await this.authRepository.updatePassword(userId, hash);
    await this.authRepository.revokeAllSessions(userId, currentSessionId ?? undefined);
  }

  async getMe(userId: string): Promise<AuthUser> {
    const identity = await this.authRepository.findIdentityById(userId);
    if (!identity || identity.status !== 'active') {
      throw DomainException.unauthenticated();
    }
    return toAuthUser(identity);
  }

  private refreshExpiresAt(): Date {
    return new Date(Date.now() + this.tokenService.config.refreshTtlDays * 24 * 60 * 60 * 1000);
  }

  private sessionInvalid(): DomainException {
    return new DomainException(ErrorCode.AUTH_SESSION_INVALID, 'Session expired or revoked');
  }
}
