import { http, HttpResponse } from 'msw';
import type { CounterpartyListItem, Paginated } from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';

import {
  demoCounterparties,
  demoCounterpartyById,
  demoCounterpartyList,
} from '../../mocks/data/counterparties.js';

/** Только ЧТЕНИЕ справочника контрагентов для UI-чекпоинта #431 (пикер
 *  поля «Контрагент», ссылки значений): живой API CRM (#460) пишет данные,
 *  мок отдаёт демо-набор — мок-мир цельный (О8). Создание и правка в моках
 *  не поддерживаются намеренно. */
export const crmReadHandlers = [
  http.get('/api/v1/counterparties/similar', () => HttpResponse.json([])),

  http.get('/api/v1/counterparties', ({ request }) => {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    const items = demoCounterpartyList()
      .filter((item) => includeArchived || item.archivedAt === null)
      .filter(
        (item: CounterpartyListItem) =>
          search === '' ||
          item.shortName.toLowerCase().includes(search) ||
          item.fullName.toLowerCase().includes(search) ||
          (item.unp ?? '').toLowerCase().includes(search),
      );
    return HttpResponse.json({ items, nextCursor: null } satisfies Paginated<CounterpartyListItem>);
  }),

  http.get('/api/v1/counterparties/:id', ({ params }) => {
    const card = demoCounterpartyById(String(params.id));
    if (!card) {
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Counterparty not found' },
        { status: 404 },
      );
    }
    return HttpResponse.json(card);
  }),
];

export { demoCounterparties };
