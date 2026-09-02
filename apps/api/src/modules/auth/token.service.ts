import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@nodus/contracts';

import { getAuthConfig, type AuthConfig } from './auth.config.js';

/** Payload access-JWT: самодостаточный AuthUser + id сессии. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  displayName: string;
  permissions: string[];
  /** Сессия, которой выдан токен (для отзыва цепочки). */
  sid: string;
}

/**
 * Токены: access — JWT (15 мин, stateless), refresh — opaque random в
 * httpOnly-cookie формата `<sessionId>.<token>`; в БД — только SHA-256 хэши.
 * Формат с sessionId позволяет искать сессию по PK без индекса по хэшу.
 */
@Injectable()
export class TokenService {
  readonly config: AuthConfig;

  constructor(private readonly jwt: JwtService) {
    this.config = getAuthConfig();
  }

  signAccessToken(user: AuthUser, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      permissions: user.permissions,
      sid: sessionId,
    };
    return this.jwt.signAsync(payload, { expiresIn: this.config.accessTtlSeconds });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }

  /** Новая refresh-пара: сырой токен (в cookie) и его хэш (в БД). */
  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(64).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Constant-time сравнение хэшей (защита от timing-атак на сессии). */
  hashesEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }

  /** Разбор cookie `<sessionId>.<token>`; null — мусор, а не сессия. */
  parseRefreshCookie(raw: string | undefined): { sessionId: string; token: string } | null {
    if (!raw) return null;
    const dot = raw.indexOf('.');
    if (dot <= 0 || dot === raw.length - 1) return null;
    return { sessionId: raw.slice(0, dot), token: raw.slice(dot + 1) };
  }
}
