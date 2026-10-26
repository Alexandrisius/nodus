import { http, HttpResponse } from 'msw';
import type { ContactPerson, CounterpartyCard } from '@nodus/contracts';
import {
  ErrorCode,
  addContactPersonBodySchema,
  createCounterpartyBodySchema,
} from '@nodus/contracts';

import { demoCounterparties, demoCounterpartyById } from '../../mocks/data/counterparties.js';

/** Запись справочника контрагентов в моках (#55): только то, что нужно
 *  регистрации письма в `--mock all` — создание контрагента «на лету» и
 *  контакта-подписанта. Полный CRUD — живой API CRM (#460). */
const invalid = () =>
  HttpResponse.json(
    { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
    { status: 422 },
  );

export const crmWriteHandlers = [
  http.post('/api/v1/counterparties', async ({ request }) => {
    const parsed = createCounterpartyBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const now = new Date().toISOString();
    const card: CounterpartyCard = {
      id: crypto.randomUUID(),
      fullName: parsed.data.fullName,
      shortName: parsed.data.shortName,
      unp: parsed.data.unp ?? null,
      address: parsed.data.address ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      customFields: {},
      lettersCount: 0,
      projectsCount: 0,
      contactPersons: [],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    demoCounterparties.push(card);
    return HttpResponse.json(card, { status: 201 });
  }),

  http.post('/api/v1/counterparties/:id/contacts', async ({ params, request }) => {
    const card = demoCounterpartyById(String(params.id));
    if (!card) {
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Counterparty not found' },
        { status: 404 },
      );
    }
    const parsed = addContactPersonBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const person: ContactPerson = {
      id: crypto.randomUUID(),
      fullName: parsed.data.fullName,
      position: parsed.data.position ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      archivedAt: null,
    };
    card.contactPersons.push(person);
    card.updatedAt = new Date().toISOString();
    return HttpResponse.json(person, { status: 201 });
  }),
];
