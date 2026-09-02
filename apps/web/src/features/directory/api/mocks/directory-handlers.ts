import { http, HttpResponse } from 'msw';

import { demoPresence, demoUserListItems } from '../../../../shared/mocks/data/users.js';

export const directoryHandlers = [
  http.get('/api/v1/directory/users', () =>
    HttpResponse.json({ items: demoUserListItems, nextCursor: null }),
  ),
  http.get('/api/v1/directory/presence', () => HttpResponse.json(demoPresence)),
];
