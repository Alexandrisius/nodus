import { jwtVerify } from 'jose';

/** Идентичность соединения из access-токена apps/api (payload: sub/sid/…). */
export interface GatewayIdentity {
  userId: string;
  sid: string | null;
}

/**
 * Верификатор access-JWT хендшейка: HS256, тот же JWT_SECRET, что у apps/api
 * (формат token.service). exp проверяется jwtVerify. Сессии (sid) не
 * проверяются — stateless, как в JwtAuthGuard api; отозванная сессия живёт
 * ≤ TTL access-токена (задокументировано в README gateway).
 */
export type AccessTokenVerifier = (token: unknown) => Promise<GatewayIdentity | null>;

export function createAccessTokenVerifier(secret: string): AccessTokenVerifier {
  const key = new TextEncoder().encode(secret);
  return async (token: unknown) => {
    if (typeof token !== 'string' || token.length === 0) {
      return null;
    }
    try {
      const { payload } = await jwtVerify(token, key);
      const userId = payload.sub;
      if (typeof userId !== 'string' || userId.length === 0) {
        return null;
      }
      return {
        userId,
        sid: typeof payload.sid === 'string' ? payload.sid : null,
      };
    } catch {
      return null; // подпись, срок или формат — любой отказ означает анонима
    }
  };
}
