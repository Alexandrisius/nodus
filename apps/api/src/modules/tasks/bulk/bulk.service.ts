import { Injectable } from '@nestjs/common';
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
  constructor(private readonly edit: TaskEditService) {}

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
                : { stageId: a.stageId },
        );
        results.push({ taskId, ok: true });
      } catch (error) {
        const code = error instanceof DomainException ? error.code : ErrorCode.INTERNAL_ERROR;
        results.push({ taskId, ok: false, code });
      }
    }
    return { results };
  }
}
