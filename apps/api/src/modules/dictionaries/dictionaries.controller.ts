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
  createDictionaryBodySchema,
  createDictionaryItemBodySchema,
  dictionaryCodeSchema,
  dictionaryItemSchema,
  dictionarySchema,
  listDictionariesQuerySchema,
  listDictionaryItemsQuerySchema,
  paginatedSchema,
  Permission,
  reorderDictionaryItemsBodySchema,
  updateDictionaryBodySchema,
  updateDictionaryItemBodySchema,
  type CreateDictionaryBody,
  type CreateDictionaryItemBody,
  type Dictionary,
  type DictionaryItem,
  type ListDictionariesQuery,
  type ListDictionaryItemsQuery,
  type Paginated,
  type ReorderDictionaryItemsBody,
  type UpdateDictionaryBody,
  type UpdateDictionaryItemBody,
} from '@nodus/contracts';
import type { AuthUser } from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { DictionariesService } from './dictionaries.service.js';
import { DictionaryItemsService } from './dictionary-items.service.js';

const idParamSchema = z.uuid();

/**
 * Справочники (`/api/v1/dictionaries`): чтение бизнес-списков (I15) любым
 * аутентифицированным — элементы нужны всем формам портала; управление —
 * правом `dictionary.manage` (#431, Р10: минимальная запись вариантов для
 * типа «Список», полный админ-контур — M12).
 */
@ApiTags('dictionaries')
@ApiBearerAuth()
@Controller('dictionaries')
export class DictionariesController {
  constructor(
    private readonly dictionariesService: DictionariesService,
    private readonly itemsService: DictionaryItemsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список справочников (по коду)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(dictionarySchema) })
  @ApiErrors(400, 401)
  list(
    @Query({
      schema: listDictionariesQuerySchema,
      pipes: [new ZodValidationPipe(listDictionariesQuerySchema)],
    })
    query: ListDictionariesQuery,
  ): Promise<Paginated<Dictionary>> {
    return this.dictionariesService.list(query);
  }

  @Post()
  @RequirePermissions(Permission.DICTIONARY_MANAGE)
  @Audit({ action: 'dictionary.create', entity: 'dictionary' })
  @ApiOperation({ summary: 'Новый справочник с вариантами (код генерирует сервер)' })
  @ApiCreatedResponse({ standardSchema: dictionarySchema })
  @ApiErrors(400, 401, 403)
  @ApiIdempotencyKey()
  create(
    @Body({
      schema: createDictionaryBodySchema,
      pipes: [new ZodValidationPipe(createDictionaryBodySchema)],
    })
    dto: CreateDictionaryBody,
    @GetUser() actor: AuthUser,
  ): Promise<Dictionary> {
    return this.itemsService.create(dto, actor.id);
  }

  @Patch(':code')
  @RequirePermissions(Permission.DICTIONARY_MANAGE)
  @Audit({ action: 'dictionary.update', entity: 'dictionary' })
  @ApiOperation({ summary: 'Переименование справочника (системный — 409)' })
  @ApiParam({ name: 'code', description: 'Код справочника', schema: { type: 'string' } })
  @ApiOkResponse({ standardSchema: dictionarySchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  rename(
    @Param('code', new ZodValidationPipe(dictionaryCodeSchema)) code: string,
    @Body({
      schema: updateDictionaryBodySchema,
      pipes: [new ZodValidationPipe(updateDictionaryBodySchema)],
    })
    dto: UpdateDictionaryBody,
    @GetUser() actor: AuthUser,
  ): Promise<Dictionary> {
    return this.itemsService.rename(code, dto, actor.id);
  }

  @Get(':code/items')
  @ApiOperation({ summary: 'Элементы справочника (порядок: sortOrder, название)' })
  @ApiParam({
    name: 'code',
    description: 'Код справочника (kebab-case), например document-kind',
    schema: { type: 'string' },
  })
  @ApiOkResponse({ standardSchema: paginatedSchema(dictionaryItemSchema) })
  @ApiErrors(400, 401, 404)
  listItems(
    @Param('code', new ZodValidationPipe(dictionaryCodeSchema)) code: string,
    @Query({
      schema: listDictionaryItemsQuerySchema,
      pipes: [new ZodValidationPipe(listDictionaryItemsQuerySchema)],
    })
    query: ListDictionaryItemsQuery,
  ): Promise<Paginated<DictionaryItem>> {
    return this.dictionariesService.listItems(code, query);
  }

  @Post(':code/items')
  @RequirePermissions(Permission.DICTIONARY_MANAGE)
  @Audit({ action: 'dictionary.item_create', entity: 'dictionary' })
  @ApiOperation({ summary: 'Новый вариант в конец списка (имя уникально среди активных)' })
  @ApiParam({ name: 'code', description: 'Код справочника', schema: { type: 'string' } })
  @ApiCreatedResponse({ standardSchema: dictionaryItemSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  createItem(
    @Param('code', new ZodValidationPipe(dictionaryCodeSchema)) code: string,
    @Body({
      schema: createDictionaryItemBodySchema,
      pipes: [new ZodValidationPipe(createDictionaryItemBodySchema)],
    })
    dto: CreateDictionaryItemBody,
    @GetUser() actor: AuthUser,
  ): Promise<DictionaryItem> {
    return this.itemsService.createItem(code, dto, actor.id);
  }

  // Буквальный сегмент объявлен раньше `:id` (Fastify матчит его первым).
  @Put(':code/items/order')
  @HttpCode(204)
  @RequirePermissions(Permission.DICTIONARY_MANAGE)
  @Audit({ action: 'dictionary.items_reorder', entity: 'dictionary' })
  @ApiOperation({ summary: 'Порядок вариантов (ids = ровно активные элементы)' })
  @ApiParam({ name: 'code', description: 'Код справочника', schema: { type: 'string' } })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  async reorderItems(
    @Param('code', new ZodValidationPipe(dictionaryCodeSchema)) code: string,
    @Body({
      schema: reorderDictionaryItemsBodySchema,
      pipes: [new ZodValidationPipe(reorderDictionaryItemsBodySchema)],
    })
    dto: ReorderDictionaryItemsBody,
    @GetUser() actor: AuthUser,
  ): Promise<void> {
    await this.itemsService.reorderItems(code, dto, actor.id);
  }

  @Patch(':code/items/:id')
  @RequirePermissions(Permission.DICTIONARY_MANAGE)
  @Audit({ action: 'dictionary.item_update', entity: 'dictionary' })
  @ApiOperation({ summary: 'Переименование варианта' })
  @ApiParam({ name: 'code', description: 'Код справочника', schema: { type: 'string' } })
  @ApiParam({
    name: 'id',
    description: 'UUID варианта',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: dictionaryItemSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  updateItem(
    @Param('code', new ZodValidationPipe(dictionaryCodeSchema)) code: string,
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Body({
      schema: updateDictionaryItemBodySchema,
      pipes: [new ZodValidationPipe(updateDictionaryItemBodySchema)],
    })
    dto: UpdateDictionaryItemBody,
    @GetUser() actor: AuthUser,
  ): Promise<DictionaryItem> {
    return this.itemsService.updateItem(code, id, dto, actor.id);
  }

  @Delete(':code/items/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.DICTIONARY_MANAGE)
  @Audit({ action: 'dictionary.item_delete', entity: 'dictionary' })
  @ApiOperation({
    summary: 'Удаление варианта (системный справочник — 409; значения читаются пустыми)',
  })
  @ApiParam({ name: 'code', description: 'Код справочника', schema: { type: 'string' } })
  @ApiParam({
    name: 'id',
    description: 'UUID варианта',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  async deleteItem(
    @Param('code', new ZodValidationPipe(dictionaryCodeSchema)) code: string,
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @GetUser() actor: AuthUser,
  ): Promise<void> {
    await this.itemsService.deleteItem(code, id, actor.id);
  }
}
