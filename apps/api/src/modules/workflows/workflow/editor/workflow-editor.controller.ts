import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  Permission,
  publishWorkflowBodySchema,
  publishWorkflowResultSchema,
  saveWorkflowLayoutBodySchema,
  saveWorkflowLayoutResultSchema,
  workflowDetailSchema,
  type AuthUser,
  type PublishWorkflowBody,
  type PublishWorkflowResult,
  type SaveWorkflowLayoutBody,
  type SaveWorkflowLayoutResult,
  type WorkflowDetail,
} from '@nodus/contracts';

import { Audit } from '../../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../../core/pipes/zod-validation.pipe.js';
import { WorkflowEditorService } from './publish.service.js';

const uuid = new ZodValidationPipe(z.uuid());

/**
 * Редактор маршрутов «Процессов» (ADR-0021/0024): чтение документа любым
 * вошедшим (решение владельца — схемы видят все), публикация — право
 * `workflow.manage`. Пути статические (`/workflows/:id` рядом с
 * `/workflows/types`) — Fastify ставит буквальные выше параметрических.
 */
@ApiTags('workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowEditorController {
  constructor(private readonly editor: WorkflowEditorService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Документ маршрута + версия + счётчики сущностей по статусам' })
  @ApiOkResponse({ standardSchema: workflowDetailSchema })
  @ApiErrors(400, 401, 404)
  read(@GetUser() user: AuthUser, @Param('id', uuid) id: string): Promise<WorkflowDetail> {
    return this.editor.read(id, user);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions(Permission.WORKFLOW_MANAGE)
  @Audit({ action: 'workflow.publish', entity: 'workflow' })
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
    return this.editor.publish(user, id, body);
  }

  @Put(':id/layout')
  @HttpCode(200)
  @RequirePermissions(Permission.WORKFLOW_MANAGE)
  @Audit({ action: 'workflow.layout_save', entity: 'workflow' })
  @ApiOperation({ summary: 'Расстановка холста маршрута — без новой версии' })
  @ApiOkResponse({ standardSchema: saveWorkflowLayoutResultSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  saveLayout(
    @GetUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body({
      schema: saveWorkflowLayoutBodySchema,
      pipes: [new ZodValidationPipe(saveWorkflowLayoutBodySchema)],
    })
    body: SaveWorkflowLayoutBody,
  ): Promise<SaveWorkflowLayoutResult> {
    return this.editor.saveLayout(user, id, body);
  }
}
