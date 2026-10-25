import { Injectable } from '@nestjs/common';
import {
  WORKFLOW_EVENTS,
  type DomainEvent,
  type DomainEventHandler,
  type WorkflowPublishedPayload,
} from '@nodus/contracts';

import { WorkflowSyncJob } from '../workflow/editor/workflow-sync.job.js';

/**
 * Подписчик `workflow.published` (ADR-0021/0024): ставит фоновое задание
 * переноса сущностей публикации. Через outbox, а не из запроса после
 * коммита: падение процесса или недоступный Redis не теряют перенос —
 * событие доставляется повторно (at-least-once), дедуп — jobId версии.
 * Категория в payload выбирает адаптер модуля-владельца.
 */
@Injectable()
export class WorkflowPublishedHandler implements DomainEventHandler<WorkflowPublishedPayload> {
  static readonly eventType = WORKFLOW_EVENTS.PUBLISHED;

  constructor(private readonly sync: WorkflowSyncJob) {}

  async handle(event: DomainEvent<WorkflowPublishedPayload>): Promise<void> {
    const { workflowId, version, category, moves, restates } = event.payload;
    await this.sync.schedule({ workflowId, version, category, moves, restates });
  }
}
