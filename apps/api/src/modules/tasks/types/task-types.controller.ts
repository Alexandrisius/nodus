import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  Permission,
  createTaskTypeBodySchema,
  taskTypeListQuerySchema,
  taskTypeSchema,
  updateTaskTypeBodySchema,
  type AuthUser,
  type CreateTaskTypeBody,
  type TaskType,
  type TaskTypeListQuery,
  type UpdateTaskTypeBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../../core/decorators/require-permissions.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { TaskTypesService } from './task-types.service.js';

const uuid = new ZodValidationPipe(z.uuid());

/**
 * Библиотека типов задач (#378): список — любой вошедший (решение владельца:
 * схемы видят все), мутации — `task.workflow_manage`. Пути статические
 * (`types/...`) — Fastify ставит их выше параметрического `:id`.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@RequireFeature('tasks')
@Controller('tasks')
export class TaskTypesController {
  constructor(private readonly types: TaskTypesService) {}

  @Get('types')
  @ApiOperation({ summary: 'Типы задач (расширенный DTO; archived=include — с архивом)' })
  @ApiOkResponse({ standardSchema: z.array(taskTypeSchema) })
  @ApiErrors(400, 401)
  list(
    @Query({
      schema: taskTypeListQuerySchema,
      pipes: [new ZodValidationPipe(taskTypeListQuerySchema)],
    })
    query: TaskTypeListQuery,
  ): Promise<TaskType[]> {
    return this.types.list(query.archived ?? 'exclude');
  }

  @Post('types')
  @RequirePermissions(Permission.TASK_WORKFLOW_MANAGE)
  @Audit({ action: 'task.type_create', entity: 'task_type' })
  @ApiOperation({ summary: 'Новый тип + маршрут из основы (копия/простой); тип скрыт' })
  @ApiCreatedResponse({ standardSchema: taskTypeSchema })
  @ApiErrors(400, 401, 403, 409)
  @ApiIdempotencyKey()
  create(
    @GetUser() user: AuthUser,
    @Body({
      schema: createTaskTypeBodySchema,
      pipes: [new ZodValidationPipe(createTaskTypeBodySchema)],
    })
    body: CreateTaskTypeBody,
  ): Promise<TaskType> {
    return this.types.create(user, body);
  }

  @Patch('types/:id')
  @HttpCode(200)
  @RequirePermissions(Permission.TASK_WORKFLOW_MANAGE)
  @Audit({ action: 'task.type_update', entity: 'task_type' })
  @ApiOperation({ summary: 'Свойства типа (ставит customizedAt — каталог не трогает)' })
  @ApiOkResponse({ standardSchema: z.object({ ok: z.literal(true) }) })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  update(
    @GetUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body({
      schema: updateTaskTypeBodySchema,
      pipes: [new ZodValidationPipe(updateTaskTypeBodySchema)],
    })
    body: UpdateTaskTypeBody,
  ): Promise<{ ok: true }> {
    return this.types.update(user, id, body).then(() => ({ ok: true as const }));
  }

  @Post('types/:id/archive')
  @HttpCode(200)
  @RequirePermissions(Permission.TASK_WORKFLOW_MANAGE)
  @Audit({ action: 'task.type_archive', entity: 'task_type' })
  @ApiOperation({ summary: 'Тип в архив (системный — 409)' })
  @ApiOkResponse({ standardSchema: z.object({ ok: z.literal(true) }) })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  archive(@GetUser() user: AuthUser, @Param('id', uuid) id: string): Promise<{ ok: true }> {
    return this.types.setArchived(user, id, true).then(() => ({ ok: true as const }));
  }

  @Post('types/:id/restore')
  @HttpCode(200)
  @RequirePermissions(Permission.TASK_WORKFLOW_MANAGE)
  @Audit({ action: 'task.type_restore', entity: 'task_type' })
  @ApiOperation({ summary: 'Вернуть тип из архива' })
  @ApiOkResponse({ standardSchema: z.object({ ok: z.literal(true) }) })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  restore(@GetUser() user: AuthUser, @Param('id', uuid) id: string): Promise<{ ok: true }> {
    return this.types.setArchived(user, id, false).then(() => ({ ok: true as const }));
  }
}
