import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { createAccessTokenVerifier } from './auth.js';

const SECRET = 'x'.repeat(32);
const OTHER_SECRET = 'y'.repeat(32);

async function signToken(
  secret: string,
  payload: Record<string, unknown>,
  expiresIn: string | number = '15m',
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

describe('createAccessTokenVerifier', () => {
  it('принимает валидный токен и извлекает sub/sid', async () => {
    const verify = createAccessTokenVerifier(SECRET);
    const token = await signToken(SECRET, { sub: 'user-1', sid: 'session-9' });
    await expect(verify(token)).resolves.toEqual({ userId: 'user-1', sid: 'session-9' });
  });

  it('отклоняет истёкший токен', async () => {
    const verify = createAccessTokenVerifier(SECRET);
    const token = await signToken(SECRET, { sub: 'user-1' }, -10);
    await expect(verify(token)).resolves.toBeNull();
  });

  it('отклоняет чужую подпись и мусор', async () => {
    const verify = createAccessTokenVerifier(SECRET);
    const foreign = await signToken(OTHER_SECRET, { sub: 'user-1' });
    await expect(verify(foreign)).resolves.toBeNull();
    await expect(verify('not-a-jwt')).resolves.toBeNull();
    await expect(verify(undefined)).resolves.toBeNull();
    await expect(verify(12345)).resolves.toBeNull();
  });

  it('отклоняет токен без sub', async () => {
    const verify = createAccessTokenVerifier(SECRET);
    const token = await signToken(SECRET, { email: 'a@b.c' });
    await expect(verify(token)).resolves.toBeNull();
  });
});
