import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { OFFICE_CONFIG, type OfficeConfig } from './office.config.js';

/**
 * JWT документ-сервера (#138): HS256 на общем секрете OFFICE_JWT_SECRET.
 * Подписывает конфиг редактора (document + editorConfig — DS сверяет
 * подпись с полученными секциями) и проверяет колбэки сохранений
 * (body.token / Authorization: Bearer). Отдельный инстанс JwtService —
 * секрет офиса ≠ JWT_SECRET авторизации.
 */
@Injectable()
export class OfficeTokenService {
  private readonly jwt: JwtService | null;

  constructor(@Inject(OFFICE_CONFIG) config: OfficeConfig) {
    this.jwt = config.jwtSecret
      ? new JwtService({ secret: config.jwtSecret, signOptions: { expiresIn: '24h' } })
      : null;
  }

  /** Подпись конфига сессии (создаётся только при включённом движке). */
  sign(payload: Record<string, unknown>): Promise<string> {
    if (!this.jwt) throw new Error('Office JWT секрет не настроен');
    return this.jwt.signAsync(payload);
  }

  /** Проверка токена колбэка; null — токен отсутствует или невалиден. */
  async verify(token: string | undefined): Promise<Record<string, unknown> | null> {
    if (!this.jwt || !token) return null;
    try {
      return await this.jwt.verifyAsync<Record<string, unknown>>(token);
    } catch {
      return null;
    }
  }
}
