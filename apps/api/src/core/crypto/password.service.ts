import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Параметры Argon2id — рекомендация RFC 9106 (и дефолты пакета argon2,
 * указаны явно, чтобы needsRehash() сравнивал с теми же значениями).
 * memoryCost в KiB: 65536 KiB = 64 MiB. Минимум OWASP — 19456 KiB / t=2 / p=1.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * Хэширование паролей (навык auth-password-hashing): Argon2id, соль и
 * параметры встроены в PHC-строку; verify — constant-time, хэш ПЕРВЫМ аргументом.
 */
@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /** true, если хэш создан с более слабыми параметрами → перехэш при логине. */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /** Криптостойкий токен (сброс пароля — V2). */
  generateSecureToken(length = 32): string {
    return randomBytes(length).toString('hex');
  }
}
