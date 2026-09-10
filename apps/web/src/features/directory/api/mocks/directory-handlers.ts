import { http, HttpResponse } from 'msw';

import {
  demoPresence,
  demoUserCards,
  demoUserListItems,
} from '../../../../shared/mocks/data/users.js';

export const directoryHandlers = [
  http.get('/api/v1/directory/users', () =>
    HttpResponse.json({ items: demoUserListItems, nextCursor: null }),
  ),
  http.get('/api/v1/directory/presence', () => HttpResponse.json(demoPresence)),
  /** Полная карточка сотрудника (UserCard: контактный блок, даты HR) —
   *  вкладка «Профиль» карточки сотрудника. */
  http.get('/api/v1/directory/users/:id', ({ params }) => {
    const card = demoUserCards.find((u) => u.id === params.id);
    if (!card)
      return HttpResponse.json({ code: 'NOT_FOUND', message: 'User not found' }, { status: 404 });
    return HttpResponse.json(card);
  }),
];
