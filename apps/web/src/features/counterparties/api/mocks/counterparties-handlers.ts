import type { ContactPerson, CounterpartyListItem } from '@nodus/contracts';
import {
  ErrorCode,
  addContactPersonBodySchema,
  createCounterpartyBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoCounterpartyCards } from '../../../../shared/mocks/data/counterparties.js';
import { demoLetters } from '../../../../shared/mocks/data/letters.js';
import { demoProjects } from '../../../../shared/mocks/data/projects.js';

const validationError = { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' };

function toListItem(card: (typeof demoCounterpartyCards)[number]): CounterpartyListItem {
  return {
    id: card.id,
    fullName: card.fullName,
    shortName: card.shortName,
    unp: card.unp,
    lettersCount: demoLetters.filter((l) => l.counterparty.id === card.id).length,
    projectsCount: demoProjects.filter((p) => p.client?.id === card.id).length,
    contactsCount: card.contactPersons.length,
  };
}

/** Мок-хендлеры справочника контрагентов (модель v2 корреспонденции,
 *  вердикт владельца 22.09.2026): реестр со счётчиками связей, карточка,
 *  создание (в т.ч. «на лету» из автокомплита регистрации), контактные лица.
 *  НЕ CRM: лиды/сделки/воронки не моделируются. */
export const counterpartiesHandlers = [
  http.get('/api/v1/counterparties', ({ request }) => {
    const search = new URL(request.url).searchParams.get('search')?.trim().toLowerCase();
    let items = demoCounterpartyCards.map(toListItem);
    if (search) {
      items = items.filter(
        (c) =>
          c.shortName.toLowerCase().includes(search) ||
          c.fullName.toLowerCase().includes(search) ||
          (c.unp ?? '').includes(search),
      );
    }
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.get('/api/v1/counterparties/:id', ({ params }) => {
    const card = demoCounterpartyCards.find((c) => c.id === params.id);
    if (!card)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Counterparty not found' },
        { status: 404 },
      );
    return HttpResponse.json(card);
  }),

  http.post('/api/v1/counterparties', async ({ request }) => {
    const parsed = createCounterpartyBodySchema.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(validationError, { status: 422 });
    const card = { ...parsed.data, id: crypto.randomUUID(), contactPersons: [] as ContactPerson[] };
    demoCounterpartyCards.push(card);
    return HttpResponse.json(card, { status: 201 });
  }),

  http.post('/api/v1/counterparties/:id/contacts', async ({ params, request }) => {
    const card = demoCounterpartyCards.find((c) => c.id === params.id);
    if (!card)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Counterparty not found' },
        { status: 404 },
      );
    const parsed = addContactPersonBodySchema.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(validationError, { status: 422 });
    const contact: ContactPerson = { id: crypto.randomUUID(), ...parsed.data };
    card.contactPersons.push(contact);
    return HttpResponse.json(contact, { status: 201 });
  }),
];
