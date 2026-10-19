import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  Permission,
  publishWorkflowBodySchema,
  publishWorkflowResultSchema,
  workflowDetailSchema,
  type AuthUser,
  type PublishWorkflowBody,
  type PublishWorkflowResult,
  type WorkflowDetail,
} from '@nodus/contracts';

import { Audit } from '../../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../../../core/decorators/require-permissions.decorator.js';
import { RequireFeature } from '../../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../../core/pipes/zod-validation.pipe.js';
import { WorkflowEditorService } from './publish.service.js';
import { WorkflowSyncJob } from './workflow-sync.job.js';

const uuid = new ZodValidationPipe(z.uuid());

/**
 * Редактор маршрутов (#378): чтение документа любым вошедшим (решение
 * владельца — схемы видят все), публикация — право `task.workflow_manage`.
 * Пути статические (`workflows/...`) — Fastify ставит их выше `:id`.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@RequireFeature('tasks')
@Controller('tasks')
export class WorkflowEditorController {
  constructor(
    private readonly editor: WorkflowEditorService,
    private readonly sync: WorkflowSyncJob,
  ) {}

  @Get('workflows/:id')
  @ApiOperation({ summary: 'Документ маршрута + версия + счётчики задач по статусам' })
  @ApiOkResponse({ standardSchema: workflowDetailSchema })
  @ApiErrors(400, 401, 404)
  read(@Param('id', uuid) id: string): Promise<WorkflowDetail> {
    return this.editor.read(id);
  }

  @Post('workflows/:id/publish')
  @HttpCode(200)
  @RequirePermissions(Permission.TASK_WORKFLOW_MANAGE)
  @Audit({ action: 'task.workflow_publish', entity: 'workflow' })
  @ApiOperation({ summary: 'Публикация документа маршрута (оптимистичная версия)' })
  @ApiOkResponse({ standardSchema: publishWorkflowResultSchema })
  @ApiErrors(400, 401, 403, 404, 409, 422)
  @ApiIdempotencyKey()
  publish(
    @GetUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body({
      schema: publishWorkflowBodySchema,
      pipes: [new ZodValidationPipe(publishWorkflowBodySchema)],
    })
    body: PublishWorkflowBody,
  ): Promise<PublishWorkflowResult> {
    return this.editor.publish(user, id, body, (outcome) => this.sync.schedule(outcome));
  }
}
