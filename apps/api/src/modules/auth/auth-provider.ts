import type { AuthIdentity } from './auth.repository.js';

/**
 * Точка расширения аутентификации (I13): интерфейс провайдера.
 * Сейчас — LocalAuthProvider (email+пароль, Argon2id); в V2 за тем же
 * интерфейсом — Keycloak/LDAP, смена реализации без смены контрактов.
 */
export interface AuthProvider {
  /**
   * Проверяет учётные данные; возвращает идентичность или null
   * (неверный email/пароль/деактивирован — без уточнения причины).
   */
  verifyCredentials(email: string, password: string): Promise<AuthIdentity | null>;
}

/** DI-токен провайдера (привязка реализации — в AuthModule). */
export const AUTH_PROVIDER = 'AUTH_PROVIDER';
