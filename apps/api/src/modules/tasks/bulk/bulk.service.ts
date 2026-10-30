import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode, type AuthUser, type TaskBulkBody, type TaskBulkResult } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { TaskEditService } from '../tasks/task-edit.service.js';

/**
 * Массовые операции (до 100 задач): каждая задача — отдельная правка через
 * тот же TaskEditService (права, видимость, гейты маршрута — индивидуально);
 * частичный успех — норма, ответ по задаче.
 */
@Injectable()
export class BulkService {
  constructor(
    private readonly edit: TaskEditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BulkService.name);
  }

  async run(user: AuthUser, body: TaskBulkBody): Promise<TaskBulkResult> {
    const results: TaskBulkResult['results'] = [];
    for (const taskId of new Set(body.taskIds)) {
      try {
        const a = body.action;
        await this.edit.update(
          user,
          taskId,
          a.kind === 'set_deadline'
            ? { deadline: a.deadline }
            : a.kind === 'set_assignee'
              ? { assigneeId: a.assigneeId }
              : a.kind === 'set_priority'
                ? { priority: a.priority }
                : a.kind === 'set_node'
                  ? { nodeId: a.nodeId }
                  : { stageId: a.stageId },
        );
        results.push({ taskId, ok: true });
      } catch (error) {
        if (!(error instanceof DomainException)) {
          this.logger.error({ err: error, taskId }, 'Bulk task action failed unexpectedly');
        }
        const code = error instanceof DomainException ? error.code : ErrorCode.INTERNAL_ERROR;
        results.push({ taskId, ok: false, code });
      }
    }
    return { results };
  }
}
