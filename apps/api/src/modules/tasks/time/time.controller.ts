import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  cursorQuerySchema,
  paginatedSchema,
  runningTimerSchema,
  timeEntryCreateBodySchema,
  timeEntrySchema,
  type AuthUser,
  type CursorQuery,
  type Paginated,
  type RunningTimer,
  type TimeEntry,
  type TimeEntryCreateBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { TimeService } from './time.service.js';

const uuid = new ZodValidationPipe(z.uuid());

/** Трудозатраты задач: ручные записи и таймер (I14). */
@ApiTags('tasks')
@ApiBearerAuth()
@RequireFeature('tasks')
@Controller('tasks')
export class TimeController {
  constructor(private readonly time: TimeService) {}

  @Get('timer')
  @ApiOperation({ summary: 'Идущий таймер текущего пользователя (null — не идёт)' })
  @ApiOkResponse({ standardSchema: runningTimerSchema.nullable() })
  @ApiErrors(401)
  current(@GetUser() user: AuthUser): Promise<RunningTimer | null> {
    return this.time.current(user.id);
  }

  @Post('timer/stop')
  @HttpCode(204)
  @Audit({ action: 'task.timer_stop', entity: 'task' })
  @ApiOperation({ summary: 'Остановить свой таймер (минуты пишутся в задачу)' })
  @ApiErrors(401, 409)
  @ApiIdempotencyKey()
  stop(@GetUser() user: AuthUser): Promise<void> {
    return this.time.stop(user);
  }

  @Delete('time-entries/:entryId')
  @HttpCode(204)
  @Audit({ action: 'task.time_delete', entity: 'task' })
  @ApiOperation({ summary: 'Удалить запись времени (автор или task.manage_any)' })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  remove(@GetUser() user: AuthUser, @Param('entryId', uuid) entryId: string): Promise<void> {
    return this.time.remove(user, entryId);
  }

  @Get(':id/time-entries')
  @ApiOperation({ summary: 'Записи времени задачи (свежие первыми)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(timeEntrySchema) })
  @ApiErrors(400, 401, 404)
  list(
    @GetUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Query({ schema: cursorQuerySchema, pipes: [new ZodValidationPipe(cursorQuerySchema)] })
    q: CursorQuery,
  ): Promise<Paginated<TimeEntry>> {
    return this.time.list(user, id, q.cursor, q.limit);
  }

  @Post(':id/time-entries')
  @Audit({ action: 'task.time_log', entity: 'task' })
  @ApiOperation({ summary: 'Внести время вручную' })
  @ApiCreatedResponse({ standardSchema: timeEntrySchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  add(
    @GetUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body({
      schema: timeEntryCreateBodySchema,
      pipes: [new ZodValidationPipe(timeEntryCreateBodySchema)],
    })
    body: TimeEntryCreateBody,
  ): Promise<TimeEntry> {
    return this.time.add(user, id, body);
  }

  @Post(':id/timer/start')
  @HttpCode(200)
  @Audit({ action: 'task.timer_start', entity: 'task' })
  @ApiOperation({ summary: 'Запустить таймер (идущий другой — останавливается)' })
  @ApiOkResponse({ standardSchema: runningTimerSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  start(@GetUser() user: AuthUser, @Param('id', uuid) id: string): Promise<RunningTimer> {
    return this.time.start(user, id);
  }
}
