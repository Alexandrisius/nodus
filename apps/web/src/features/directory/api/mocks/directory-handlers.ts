import { http, HttpResponse } from 'msw';
import { createInvitationSchema } from '@nodus/contracts';

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
  /** Приглашение сотрудника (кнопка «Пригласить») — заготовка: принимает
   *  email, полный поток (роль, подразделение, письмо-инвайт) — с бэкендом. */
  http.post('/api/v1/directory/invitations', async ({ request }) => {
    const parsed = createInvitationSchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid email' },
        { status: 400 },
      );
    return HttpResponse.json({ id: crypto.randomUUID() }, { status: 201 });
  }),
];
