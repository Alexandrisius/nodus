import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRM_EVENTS, ErrorCode } from '@nodus/contracts';

import { ContactsService } from './contacts.service.js';

const CP = '00000000-0000-4000-8000-000000000201';
const CONTACT = '00000000-0000-4000-8000-000000000202';

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT,
    fullName: 'Иванов Иван Иванович',
    position: 'Директор',
    email: null,
    phone: null,
    archivedAt: null,
    ...overrides,
  };
}

describe('ContactsService (#460)', () => {
  const contacts = {
    create: vi.fn(),
    update: vi.fn(),
    setArchivedAt: vi.fn(),
    findOwned: vi.fn(),
    delete: vi.fn(),
  };
  const counterparties = { findById: vi.fn() };
  const usages = { contactInUse: vi.fn(async () => false) };
  const txRunner = { run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) };
  const eventBus = { emit: vi.fn() };
  let service: ContactsService;

  beforeEach(() => {
    vi.clearAllMocks();
    counterparties.findById.mockResolvedValue({ id: CP, archivedAt: null });
    service = new ContactsService(
      contacts as never,
      counterparties as never,
      usages as never,
      txRunner as never,
      eventBus as never,
    );
  });

  it('нет контрагента → NOT_FOUND; контрагент в архиве → CRM_COUNTERPARTY_ARCHIVED', async () => {
    counterparties.findById.mockResolvedValueOnce(null);
    await expect(service.add(CP, { fullName: 'Иванов' }, 'actor')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });

    counterparties.findById.mockResolvedValueOnce({ id: CP, archivedAt: new Date() });
    await expect(service.add(CP, { fullName: 'Иванов' }, 'actor')).rejects.toMatchObject({
      code: ErrorCode.CRM_COUNTERPARTY_ARCHIVED,
    });
    expect(contacts.create).not.toHaveBeenCalled();
  });

  it('добавление: null-дефолты и событие crm.contact_changed(added)', async () => {
    contacts.create.mockResolvedValue(contact({ position: null }));

    const created = await service.add(CP, { fullName: 'Иванов Иван Иванович' }, 'actor');

    expect(contacts.create).toHaveBeenCalledWith(
      CP,
      { fullName: 'Иванов Иван Иванович', position: null, email: null, phone: null },
      {},
    );
    expect(created).toMatchObject({ id: CONTACT, archivedAt: null });
    expect(eventBus.emit).toHaveBeenCalledWith(
      {},
      CRM_EVENTS.CONTACT_CHANGED,
      { counterpartyId: CP, contactId: CONTACT, change: 'added' },
      { actorId: 'actor', aggregateType: 'counterparty', aggregateId: CP },
    );
  });

  it('контакт чужого контрагента → NOT_FOUND (IDOR-граница)', async () => {
    contacts.findOwned.mockResolvedValue(null);
    await expect(
      service.update(CP, CONTACT, { position: 'Директор' }, 'actor'),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('правка архивного контакта → CONFLICT; пустая правка — без события', async () => {
    contacts.findOwned.mockResolvedValueOnce(contact({ archivedAt: new Date() }));
    await expect(
      service.update(CP, CONTACT, { position: 'Директор' }, 'actor'),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    contacts.findOwned.mockResolvedValueOnce(contact());
    await service.update(CP, CONTACT, { position: 'Директор' }, 'actor');
    expect(contacts.update).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('правка: в событие уходят изменённые поля', async () => {
    contacts.findOwned.mockResolvedValue(contact());
    contacts.update.mockResolvedValue(contact({ position: 'Генеральный директор' }));

    await service.update(CP, CONTACT, { position: 'Генеральный директор' }, 'actor');

    expect(contacts.update).toHaveBeenCalledWith(CONTACT, { position: 'Генеральный директор' }, {});
    expect(eventBus.emit).toHaveBeenCalledWith(
      {},
      CRM_EVENTS.CONTACT_CHANGED,
      { counterpartyId: CP, contactId: CONTACT, change: 'updated', fields: ['position'] },
      { actorId: 'actor', aggregateType: 'counterparty', aggregateId: CP },
    );
  });

  it('удаление: чужой контакт → NOT_FOUND; свой — физически + change deleted', async () => {
    contacts.findOwned.mockResolvedValueOnce(null);
    await expect(service.remove(CP, CONTACT, 'actor')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(contacts.delete).not.toHaveBeenCalled();

    contacts.findOwned.mockResolvedValueOnce(contact());
    await service.remove(CP, CONTACT, 'actor');
    expect(contacts.delete).toHaveBeenCalledWith(CONTACT, {});
    expect(eventBus.emit).toHaveBeenCalledWith(
      {},
      CRM_EVENTS.CONTACT_CHANGED,
      { counterpartyId: CP, contactId: CONTACT, change: 'deleted' },
      { actorId: 'actor', aggregateType: 'counterparty', aggregateId: CP },
    );
  });

  it('архив и возврат идемпотентны и эмитят соответствующий change', async () => {
    contacts.findOwned.mockResolvedValueOnce(contact({ archivedAt: new Date() }));
    await service.setArchived(CP, CONTACT, true, 'actor');
    expect(contacts.setArchivedAt).not.toHaveBeenCalled();

    contacts.findOwned.mockResolvedValueOnce(contact());
    contacts.setArchivedAt.mockResolvedValue(contact({ archivedAt: new Date() }));
    await service.setArchived(CP, CONTACT, true, 'actor');
    expect(eventBus.emit).toHaveBeenCalledWith(
      {},
      CRM_EVENTS.CONTACT_CHANGED,
      { counterpartyId: CP, contactId: CONTACT, change: 'archived' },
      { actorId: 'actor', aggregateType: 'counterparty', aggregateId: CP },
    );
  });
});
