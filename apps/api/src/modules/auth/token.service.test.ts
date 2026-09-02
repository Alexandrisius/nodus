import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';

import { TokenService } from './token.service.js';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-secret-key-min-32-chars-long';
    service = new TokenService(new JwtService({ secret: process.env.JWT_SECRET }));
  });

  describe('refresh-токен', () => {
    it('generate → hash детерминирован и отличается от токена', () => {
      const { token, hash } = service.generateRefreshToken();
      expect(token).toHaveLength(86); // 64 байта base64url
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(service.hashRefreshToken(token)).toBe(hash);
    });

    it('hashesEqual: constant-time сравнение', () => {
      const { hash } = service.generateRefreshToken();
      expect(service.hashesEqual(hash, hash)).toBe(true);
      expect(service.hashesEqual(hash, service.generateRefreshToken().hash)).toBe(false);
      expect(service.hashesEqual(hash, 'abcd')).toBe(false); // разная длина
    });
  });

  describe('parseRefreshCookie', () => {
    it('парсит формат <sessionId>.<token>', () => {
      expect(service.parseRefreshCookie('sid-123.tok-abc')).toEqual({
        sessionId: 'sid-123',
        token: 'tok-abc',
      });
    });

    it.each([undefined, '', 'no-delimiter', '.empty-sid', 'empty-token.'])(
      'мусор → null: %s',
      (raw) => {
        expect(service.parseRefreshCookie(raw)).toBeNull();
      },
    );
  });

  describe('access-JWT', () => {
    it('sign → verify возвращает payload с sid', async () => {
      const token = await service.signAccessToken(
        { id: 'u1', email: 'a@b.by', displayName: 'Тест', permissions: ['directory.read'] },
        'session-1',
      );
      const payload = await service.verifyAccessToken(token);
      expect(payload.sub).toBe('u1');
      expect(payload.sid).toBe('session-1');
      expect(payload.permissions).toEqual(['directory.read']);
    });

    it('чужой секрет → verify падает', async () => {
      const token = await service.signAccessToken(
        { id: 'u1', email: 'a@b.by', displayName: 'Тест', permissions: [] },
        's1',
      );
      const other = new TokenService(
        new JwtService({ secret: 'other-secret-key-min-32-chars-xx' }),
      );
      await expect(other.verifyAccessToken(token)).rejects.toThrow();
    });
  });
});
