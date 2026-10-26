import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  createCustomFieldBodySchema,
  customFieldDefinitionSchema,
  customFieldUsageSchema,
  listCustomFieldsQuerySchema,
  Permission,
  reorderCustomFieldsBodySchema,
  updateCustomFieldBodySchema,
  type CreateCustomFieldBody,
  type CustomFieldDefinition,
  type CustomFieldUsage,
  type ListCustomFieldsQuery,
  type ReorderCustomFieldsBody,
  type UpdateCustomFieldBody,
} from '@nodus/contracts';
import type { AuthUser } from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { DefinitionsBindingService } from './definitions-binding.service.js';
import { DefinitionsService } from './definitions.service.js';

const idParamSchema = z.uuid();

/**
 * Реестр атрибутов (`/api/v1/custom-fields/definitions`, ADR-0029, #431).
 * Чтение — всем аутентифицированным (карточки, фильтры, окна переходов
 * нужны каждому); создание, правка, порядок и удаление — правом
 * `custom_field.manage` (по умолчанию администратор, I8).
 */
@ApiTags('custom-fields')
@ApiBearerAuth()
@Controller('custom-fields/definitions')
export class DefinitionsController {
  constructor(
    private readonly definitions: DefinitionsService,
    private readonly bindings: DefinitionsBindingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Реестр атрибутов (область — необязательный фильтр)' })
  @ApiOkResponse({ standardSchema: z.array(customFieldDefinitionSchema) })
  @ApiErrors(400, 401)
  list(
    @Query({
      schema: listCustomFieldsQuerySchema,
      pipes: [new ZodValidationPipe(listCustomFieldsQuerySchema)],
    })
    query: ListCustomFieldsQuery,
  ): Promise<CustomFieldDefinition[]> {
    return this.definitions.list(query.scope ?? null);
  }

  @Post()
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @Audit({ action: 'custom_field.create', entity: 'field_definition' })
  @ApiOperation({ summary: 'Новый атрибут области (имя уникально, лимит 100)' })
  @ApiCreatedResponse({ standardSchema: customFieldDefinitionSchema })
  @ApiErrors(400, 401, 403, 409, 422)
  @ApiIdempotencyKey()
  create(
    @Body({
      schema: createCustomFieldBodySchema,
      pipes: [new ZodValidationPipe(createCustomFieldBodySchema)],
    })
    dto: CreateCustomFieldBody,
    @GetUser() actor: AuthUser,
  ): Promise<CustomFieldDefinition> {
    return this.definitions.create(dto, actor.id);
  }

  // Буквальный сегмент объявлен раньше `:id` (Fastify матчит его первым).
  @Put('order')
  @HttpCode(204)
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @Audit({ action: 'custom_field.reorder', entity: 'field_definition' })
  @ApiOperation({ summary: 'Порядок атрибутов области (ids = ровно все атрибуты)' })
  @ApiErrors(400, 401, 403, 409)
  @ApiIdempotencyKey()
  async reorder(
    @Body({
      schema: reorderCustomFieldsBodySchema,
      pipes: [new ZodValidationPipe(reorderCustomFieldsBodySchema)],
    })
    dto: ReorderCustomFieldsBody,
    @GetUser() actor: AuthUser,
  ): Promise<void> {
    await this.definitions.reorder(dto, actor.id);
  }

  @Get(':id/usage')
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @ApiOperation({ summary: 'Где используется атрибут: заполненные карточки и процессы' })
  @ApiParam({
    name: 'id',
    description: 'UUID атрибута',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: customFieldUsageSchema })
  @ApiErrors(400, 401, 403, 404)
  usage(@Param('id', new ZodValidationPipe(idParamSchema)) id: string): Promise<CustomFieldUsage> {
    return this.definitions.usage(id);
  }

  // Привязка атрибута к типу процесса (#432, Р8): идемпотентна, ответ — DTO.
  @Put(':id/types/:typeId')
  @HttpCode(200)
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @Audit({ action: 'custom_field.bind', entity: 'field_definition' })
  @ApiOperation({ summary: 'Привязать атрибут к типу процесса (повтор — без изменений)' })
  @ApiParam({
    name: 'id',
    description: 'UUID атрибута',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({
    name: 'typeId',
    description: 'UUID типа',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: customFieldDefinitionSchema })
  @ApiErrors(400, 401, 403, 404, 422)
  @ApiIdempotencyKey()
  bind(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Param('typeId', new ZodValidationPipe(idParamSchema)) typeId: string,
    @GetUser() actor: AuthUser,
  ): Promise<CustomFieldDefinition> {
    return this.bindings.bind(id, typeId, actor.id);
  }

  @Delete(':id/types/:typeId')
  @HttpCode(200)
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @Audit({ action: 'custom_field.unbind', entity: 'field_definition' })
  @ApiOperation({ summary: 'Снять привязку атрибута к типу (409, если работает в маршруте)' })
  @ApiParam({
    name: 'id',
    description: 'UUID атрибута',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({
    name: 'typeId',
    description: 'UUID типа',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: customFieldDefinitionSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  unbind(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Param('typeId', new ZodValidationPipe(idParamSchema)) typeId: string,
    @GetUser() actor: AuthUser,
  ): Promise<CustomFieldDefinition> {
    return this.bindings.unbind(id, typeId, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @Audit({ action: 'custom_field.update', entity: 'field_definition' })
  @ApiOperation({ summary: 'Правка атрибута (тип — только расширяющая смена)' })
  @ApiParam({
    name: 'id',
    description: 'UUID атрибута',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: customFieldDefinitionSchema })
  @ApiErrors(400, 401, 403, 404, 409, 422)
  @ApiIdempotencyKey()
  update(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Body({
      schema: updateCustomFieldBodySchema,
      pipes: [new ZodValidationPipe(updateCustomFieldBodySchema)],
    })
    dto: UpdateCustomFieldBody,
    @GetUser() actor: AuthUser,
  ): Promise<CustomFieldDefinition> {
    return this.definitions.update(id, dto, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.CUSTOM_FIELD_MANAGE)
  @Audit({ action: 'custom_field.delete', entity: 'field_definition' })
  @ApiOperation({ summary: 'Удаление атрибута (запрещено, пока стоит в процессах)' })
  @ApiParam({
    name: 'id',
    description: 'UUID атрибута',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiErrors(401, 403, 404, 409)
  @ApiIdempotencyKey()
  async remove(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @GetUser() actor: AuthUser,
  ): Promise<void> {
    await this.definitions.remove(id, actor.id);
  }
}
