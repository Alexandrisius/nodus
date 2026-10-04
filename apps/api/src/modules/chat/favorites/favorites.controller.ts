import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  addFavoritesBodySchema,
  addFavoritesResultSchema,
  favoriteCardSchema,
  favoriteLabelListSchema,
  favoriteSourcesSchema,
  listFavoritesQuerySchema,
  paginatedSchema,
  updateFavoriteBodySchema,
  type AddFavoritesBody,
  type AddFavoritesResult,
  type FavoriteCard,
  type FavoriteLabelList,
  type FavoriteSources,
  type ListFavoritesQuery,
  type Paginated,
  type UpdateFavoriteBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { FavoritesService } from './favorites.service.js';

const uuidSchema = z.uuid();

/**
 * Избранное (#171): личные закладки-ссылки на сообщения (`/api/v1/chat/favorites`).
 * Приватность — звезда строго личная: выдача/правка только своих закладок,
 * события не рассылаются другим участникам (user-комната владельца).
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Карточки избранного текущего пользователя (свежие первыми; фильтры: чат, метка, поиск)',
  })
  @ApiOkResponse({ standardSchema: paginatedSchema(favoriteCardSchema) })
  @ApiErrors(400, 401, 404)
  list(
    @GetUser() user: { id: string },
    @Query({
      schema: listFavoritesQuerySchema,
      pipes: [new ZodValidationPipe(listFavoritesQuerySchema)],
    })
    query: ListFavoritesQuery,
  ): Promise<Paginated<FavoriteCard>> {
    return this.favorites.list(user.id, query);
  }

  @Get('labels')
  @ApiOperation({ summary: 'Существующие метки пользователя (подсказки при вводе)' })
  @ApiOkResponse({ standardSchema: favoriteLabelListSchema })
  @ApiErrors(400, 401)
  labels(@GetUser() user: { id: string }): Promise<FavoriteLabelList> {
    return this.favorites.labels(user.id);
  }

  @Get('sources')
  @ApiOperation({
    summary:
      'Источники «Избранного» (#211): чаты, откуда прилетали звёзды, + счётчики типов + «Записи»',
  })
  @ApiOkResponse({ standardSchema: favoriteSourcesSchema })
  @ApiErrors(400, 401)
  sources(@GetUser() user: { id: string }): Promise<FavoriteSources> {
    return this.favorites.sources(user.id);
  }

  @Post()
  @HttpCode(200)
  @Audit({ action: 'chat.favorite_add', entity: 'message' })
  @ApiOperation({
    summary: 'Поставить звёзды (порядок массива = порядок цепочки в «Избранном»; идемпотентно)',
  })
  @ApiOkResponse({ standardSchema: addFavoritesResultSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  add(
    @GetUser() user: { id: string },
    @Body({
      schema: addFavoritesBodySchema,
      pipes: [new ZodValidationPipe(addFavoritesBodySchema)],
    })
    dto: AddFavoritesBody,
  ): Promise<AddFavoritesResult> {
    return this.favorites.add(user.id, dto);
  }

  @Patch(':messageId')
  @HttpCode(200)
  @Audit({ action: 'chat.favorite_update', entity: 'message' })
  @ApiOperation({ summary: 'Личные эмодзи-метки закладки (весь состав массивом)' })
  @ApiOkResponse({ standardSchema: favoriteCardSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  update(
    @GetUser() user: { id: string },
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
    @Body({
      schema: updateFavoriteBodySchema,
      pipes: [new ZodValidationPipe(updateFavoriteBodySchema)],
    })
    dto: UpdateFavoriteBody,
  ): Promise<FavoriteCard> {
    return this.favorites.update(user.id, messageId, dto);
  }

  @Delete(':messageId')
  @HttpCode(204)
  @Audit({ action: 'chat.favorite_remove', entity: 'message' })
  @ApiOperation({ summary: 'Снять звезду (незвёздное — тихо, toggle-идемпотентность)' })
  @ApiNoContentResponse({ description: 'Снято' })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  remove(
    @GetUser() user: { id: string },
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
  ): Promise<void> {
    return this.favorites.remove(user.id, messageId);
  }
}
