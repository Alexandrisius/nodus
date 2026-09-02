import { Injectable } from '@nestjs/common';

import type { AuthProvider } from './auth-provider.js';
import { AuthRepository, type AuthIdentity } from './auth.repository.js';
import { PasswordService } from './password.service.js';

/**
 * Локальный провайдер (email+пароль, Argon2id) — реализация AuthProvider (I13).
 * Защита от user-enumeration: при несуществующем email verify идёт против
 * заранее вычисленного dummy-хэша — время ответа не выдаёт наличие учётки.
 */
// Dummy-хэш пароля «nodus-timing-equalizer» параметрами ARGON2_OPTIONS.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$O6YbAFJKXdMP2kbW3T+D8A$F5fkHa1M5mCDzSR+LNC1Z9vHez7dYzFjy+LBvk0VImE';

@Injectable()
export class LocalAuthProvider implements AuthProvider {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async verifyCredentials(email: string, password: string): Promise<AuthIdentity | null> {
    const credentials = await this.authRepository.findCredentialsByEmail(email);

    const hash = credentials?.passwordHash ?? DUMMY_HASH;
    const valid = await this.passwordService.verify(hash, password);
    if (!credentials || !valid || credentials.status !== 'active') {
      return null;
    }

    // Прозрачный апгрейд хэша при повышении параметров (needsRehash).
    if (this.passwordService.needsRehash(hash)) {
      const newHash = await this.passwordService.hash(password);
      await this.authRepository.updatePassword(credentials.id, newHash);
    }

    return this.authRepository.findIdentityById(credentials.id);
  }
}
