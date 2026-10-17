import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  dictionaryCodeSchema,
  dictionaryItemSchema,
  dictionarySchema,
  listDictionariesQuerySchema,
  listDictionaryItemsQuerySchema,
  paginatedSchema,
  type Dictionary,
  type DictionaryItem,
  type ListDictionariesQuery,
  type ListDictionaryItemsQuery,
  type Paginated,
} from '@nodus/contracts';

import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { DictionariesService } from './dictionaries.service.js';

/**
 * Справочники (`/api/v1/dictionaries`): чтение бизнес-списков (I15) любым
 * аутентифицированным — элементы нужны всем формам портала; управление —
 * правом `dictionary.manage` (с UI справочников, M12).
 */
@ApiTags('dictionaries')
@ApiBearerAuth()
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly dictionariesService: DictionariesService) {}

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
}
