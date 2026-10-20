import { Injectable } from '@nestjs/common';
import {
  TASK_EVENTS,
  type DomainEvent,
  type DomainEventHandler,
  type TaskWorkflowPublishedPayload,
} from '@nodus/contracts';

import { WorkflowSyncJob } from '../workflow/editor/workflow-sync.job.js';

/**
 * Подписчик `task.workflow_published` (#378, ADR-0021): ставит фоновое
 * задание переноса задач публикации. Через outbox, а не из запроса после
 * коммита: падение процесса или недоступный Redis не теряют перенос —
 * событие доставляется повторно (at-least-once), дедуп — jobId версии.
 */
@Injectable()
export class WorkflowPublishedHandler implements DomainEventHandler<TaskWorkflowPublishedPayload> {
  static readonly eventType = TASK_EVENTS.WORKFLOW_PUBLISHED;

  constructor(private readonly sync: WorkflowSyncJob) {}

  async handle(event: DomainEvent<TaskWorkflowPublishedPayload>): Promise<void> {
    const { workflowId, version, moves, restates } = event.payload;
    await this.sync.schedule({ workflowId, version, moves, restates });
  }
}
