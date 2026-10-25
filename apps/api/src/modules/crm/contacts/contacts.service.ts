import { Injectable } from '@nestjs/common';
import {
  CRM_EVENTS,
  ErrorCode,
  type AddContactPersonBody,
  type ContactPerson,
  type UpdateContactPersonBody,
} from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { toContactPerson } from '../counterparties/counterparty-dto.mapper.js';
import { CounterpartiesRepository } from '../counterparties/counterparties.repository.js';
import {
  ContactsRepository,
  type ContactPersonRow,
  type ContactPersonWriteData,
} from './contacts.repository.js';

function writeDataOf(dto: UpdateContactPersonBody): Partial<ContactPersonWriteData> {
  const data: Partial<ContactPersonWriteData> = {};
  if (dto.fullName !== undefined) data.fullName = dto.fullName;
  if (dto.position !== undefined) data.position = dto.position;
  if (dto.email !== undefined) data.email = dto.email;
  if (dto.phone !== undefined) data.phone = dto.phone;
  return data;
}

/**
 * Контактные лица контрагента: добавление, правка, архив и возврат.
 * Мутации — только у действующего контрагента (карточка в архиве read-only),
 * контакт обязан принадлежать контрагенту из пути (иначе 404 — IDOR-граница).
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly contacts: ContactsRepository,
    private readonly counterparties: CounterpartiesRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
  ) {}

  async add(
    counterpartyId: string,
    dto: AddContactPersonBody,
    actorId: string,
  ): Promise<ContactPerson> {
    await this.requireActiveCounterparty(counterpartyId);
    return this.txRunner.run(async (tx) => {
      const created = await this.contacts.create(
        counterpartyId,
        {
          fullName: dto.fullName,
          position: dto.position ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
        },
        tx,
      );
      await this.emit(tx, counterpartyId, created.id, 'added', actorId);
      return toContactPerson(created);
    });
  }

  async update(
    counterpartyId: string,
    contactId: string,
    dto: UpdateContactPersonBody,
    actorId: string,
  ): Promise<ContactPerson> {
    await this.requireActiveCounterparty(counterpartyId);
    const before = await this.findOwned(counterpartyId, contactId);
    if (before.archivedAt) {
      throw DomainException.conflict('Contact is archived — restore it first', { contactId });
    }

    const candidate = writeDataOf(dto);
    const changed = Object.entries(candidate).filter(
      ([field, value]) => before[field as keyof ContactPersonRow] !== value,
    );
    if (changed.length === 0) return toContactPerson(before);

    return this.txRunner.run(async (tx) => {
      const updated = await this.contacts.update(
        contactId,
        Object.fromEntries(changed) as Partial<ContactPersonWriteData>,
        tx,
      );
      await this.emit(
        tx,
        counterpartyId,
        contactId,
        'updated',
        actorId,
        changed.map(([field]) => field),
      );
      return toContactPerson(updated);
    });
  }

  /** Архив (`archived: true`) и возврат (`false`) — идемпотентно. */
  async setArchived(
    counterpartyId: string,
    contactId: string,
    archived: boolean,
    actorId: string,
  ): Promise<ContactPerson> {
    await this.requireActiveCounterparty(counterpartyId);
    const before = await this.findOwned(counterpartyId, contactId);
    if ((before.archivedAt !== null) === archived) return toContactPerson(before);

    return this.txRunner.run(async (tx) => {
      const updated = await this.contacts.setArchivedAt(
        contactId,
        archived ? new Date() : null,
        tx,
      );
      await this.emit(tx, counterpartyId, contactId, archived ? 'archived' : 'restored', actorId);
      return toContactPerson(updated);
    });
  }

  /**
   * Удаление контактного лица (вердикт владельца 25.10.2026): внутренняя
   * запись карточки, наружу не ссылается — удаляется физически. Контакт
   * обязан принадлежать контрагенту из пути (иначе 404, IDOR-граница).
   */
  async remove(counterpartyId: string, contactId: string, actorId: string): Promise<void> {
    await this.requireActiveCounterparty(counterpartyId);
    await this.findOwned(counterpartyId, contactId);
    await this.txRunner.run(async (tx) => {
      await this.contacts.delete(contactId, tx);
      await this.emit(tx, counterpartyId, contactId, 'deleted', actorId);
    });
  }

  private async requireActiveCounterparty(counterpartyId: string): Promise<void> {
    const row = await this.counterparties.findById(counterpartyId);
    if (!row) throw DomainException.notFound('Counterparty not found');
    if (row.archivedAt) {
      throw new DomainException(ErrorCode.CRM_COUNTERPARTY_ARCHIVED, 'Counterparty is archived', {
        counterpartyId,
      });
    }
  }

  private async findOwned(counterpartyId: string, contactId: string): Promise<ContactPersonRow> {
    const row = await this.contacts.findOwned(counterpartyId, contactId);
    if (!row) throw DomainException.notFound('Contact person not found');
    return row;
  }

  private async emit(
    tx: Parameters<EventBus['emit']>[0],
    counterpartyId: string,
    contactId: string,
    change: 'added' | 'updated' | 'archived' | 'restored' | 'deleted',
    actorId: string,
    fields?: string[],
  ): Promise<void> {
    await this.eventBus.emit(
      tx,
      CRM_EVENTS.CONTACT_CHANGED,
      { counterpartyId, contactId, change, ...(fields ? { fields } : {}) },
      { actorId, aggregateType: 'counterparty', aggregateId: counterpartyId },
    );
  }
}
