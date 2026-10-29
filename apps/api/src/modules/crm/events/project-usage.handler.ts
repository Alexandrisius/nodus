import { Injectable } from '@nestjs/common';
import {
  PROJECT_EVENTS,
  type DomainEvent,
  type ProjectCreatedPayload,
  type ProjectUpdatedPayload,
} from '@nodus/contracts';

import { CounterpartyUsagesRepository } from '../counterparties/counterparty-usages.repository.js';

/**
 * Проекция «проекты контрагента» (#52, Р13; ADR-0033 п.3): создание с
 * заказчиком пишет строку использования, смена/снятие заказчика — правит
 * (значения в payload, crm не читает чужие таблицы, I3). Идемпотентно:
 * upsert/deleteMany, повторная доставка outbox безопасна. Статусы и
 * архив проекта строку не трогают — использование не исчезает.
 */
@Injectable()
export class ProjectCreatedUsageHandler {
  static readonly eventType = PROJECT_EVENTS.CREATED;

  constructor(private readonly usages: CounterpartyUsagesRepository) {}

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const payload = event.payload as unknown as ProjectCreatedPayload;
    if (!payload.clientId) return;
    await this.usages.upsertProject({
      sourceId: payload.projectId,
      counterpartyId: payload.clientId,
    });
  }
}

@Injectable()
export class ProjectUpdatedUsageHandler {
  static readonly eventType = PROJECT_EVENTS.UPDATED;

  constructor(private readonly usages: CounterpartyUsagesRepository) {}

  async handle(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const payload = event.payload as unknown as ProjectUpdatedPayload;
    if (payload.clientId === undefined) return; // смена полей без заказчика
    if (payload.clientId === null) {
      // Заказчик снят — проект больше не «использует» контрагента.
      await this.usages.deleteProject(payload.projectId);
      return;
    }
    await this.usages.upsertProject({
      sourceId: payload.projectId,
      counterpartyId: payload.clientId,
    });
  }
}
