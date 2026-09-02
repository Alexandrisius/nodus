import { http, HttpResponse } from 'msw';

import { currentAuthUser } from '../../../../shared/mocks/data/users.js';

const tokens = { accessToken: 'mock-access-token', expiresIn: 900 };
const COOKIE = 'nodus_refresh';

function isDead(request: Request): boolean {
  return request.headers.get('cookie')?.includes(`${COOKIE}=dead`) ?? false;
}

/**
 * MSW-слой auth (ADR-0001): демо-сессия любыми данными; logout убивает сессию
 * cookie-меткой, чтобы в демо работали «Выйти» и экран входа.
 */
export const authHandlers = [
  http.post('/api/v1/auth/login', () =>
    HttpResponse.json(tokens, { headers: { 'Set-Cookie': `${COOKIE}=alive; Path=/` } }),
  ),

  http.post('/api/v1/auth/refresh', ({ request }) =>
    isDead(request)
      ? HttpResponse.json(
          { code: 'AUTH_SESSION_INVALID', message: 'Session invalid' },
          { status: 401 },
        )
      : HttpResponse.json(tokens, { headers: { 'Set-Cookie': `${COOKIE}=alive; Path=/` } }),
  ),

  http.get('/api/v1/auth/me', ({ request }) =>
    isDead(request)
      ? HttpResponse.json({ code: 'UNAUTHENTICATED', message: 'Unauthenticated' }, { status: 401 })
      : HttpResponse.json(currentAuthUser),
  ),

  http.post(
    '/api/v1/auth/logout',
    () =>
      new HttpResponse(null, { status: 204, headers: { 'Set-Cookie': `${COOKIE}=dead; Path=/` } }),
  ),
];
