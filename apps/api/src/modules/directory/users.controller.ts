import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  createUserSchema,
  listUsersQuerySchema,
  paginatedSchema,
  updateMyProfileSchema,
  updateUserSchema,
  userCardSchema,
  userListItemSchema,
  Permission,
  type AuthUser,
  type CreateUserDto,
  type ListUsersQuery,
  type Paginated,
  type UpdateMyProfileDto,
  type UpdateUserDto,
  type UserCard,
  type UserListItem,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

/**
 * Справочник сотрудников (`/api/v1/directory/users`).
 * Чтение — directory.read, мутации — directory.manage (RBAC на API, I8);
 * саморедактирование профиля — любому аутентифицированному.
 */
@ApiTags('directory')
@ApiBearerAuth()
@Controller('directory/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(Permission.DIRECTORY_READ)
  @ApiOperation({ summary: 'Список сотрудников (курсорная пагинация, поиск)' })
  @ApiOkResponse({ standardSchema: paginatedSchema(userListItemSchema) })
  @ApiErrors(400, 401, 403)
  list(
    @Query({ schema: listUsersQuerySchema, pipes: [new ZodValidationPipe(listUsersQuerySchema)] })
    query: ListUsersQuery,
  ): Promise<Paginated<UserListItem>> {
    return this.usersService.listUsers(query);
  }

  @Patch('me')
  @Audit({ action: 'directory.user.update_profile', entity: 'user' })
  @ApiOperation({ summary: 'Саморедактирование своего профиля (контактный блок)' })
  @ApiOkResponse({ standardSchema: userCardSchema })
  @ApiErrors(400, 401)
  updateMyProfile(
    @GetUser() user: AuthUser,
    @Body({ schema: updateMyProfileSchema, pipes: [new ZodValidationPipe(updateMyProfileSchema)] })
    dto: UpdateMyProfileDto,
  ): Promise<UserCard> {
    return this.usersService.updateMyProfile(user.id, dto);
  }

  @Get(':id')
  @RequirePermissions(Permission.DIRECTORY_READ)
  @ApiOperation({ summary: 'Карточка сотрудника' })
  @ApiParam({
    name: 'id',
    description: 'UUID сотрудника',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: userCardSchema })
  @ApiErrors(401, 403, 404)
  getCard(@Param('id') id: string): Promise<UserCard> {
    return this.usersService.getUserCard(id);
  }

  @Post()
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.user.create', entity: 'user' })
  @ApiOperation({ summary: 'Создание сотрудника (администратор)' })
  @ApiCreatedResponse({ standardSchema: userCardSchema })
  @ApiErrors(400, 401, 403, 409)
  @ApiIdempotencyKey()
  create(
    @Body({ schema: createUserSchema, pipes: [new ZodValidationPipe(createUserSchema)] })
    dto: CreateUserDto,
    @GetUser() actor: AuthUser,
  ): Promise<UserCard> {
    return this.usersService.createUser(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.user.update', entity: 'user' })
  @ApiOperation({ summary: 'Обновление карточки сотрудника (администратор)' })
  @ApiParam({
    name: 'id',
    description: 'UUID сотрудника',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: userCardSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  update(
    @Param('id') id: string,
    @Body({ schema: updateUserSchema, pipes: [new ZodValidationPipe(updateUserSchema)] })
    dto: UpdateUserDto,
    @GetUser() actor: AuthUser,
  ): Promise<UserCard> {
    return this.usersService.updateUser(id, dto, actor.id);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.user.deactivate', entity: 'user' })
  @ApiOperation({ summary: 'Деактивация сотрудника (без удаления, I15)' })
  @ApiParam({
    name: 'id',
    description: 'UUID сотрудника',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: userCardSchema })
  @ApiErrors(401, 403, 404, 409)
  @ApiIdempotencyKey()
  deactivate(@Param('id') id: string, @GetUser() actor: AuthUser): Promise<UserCard> {
    return this.usersService.deactivateUser(id, actor.id);
  }
}
