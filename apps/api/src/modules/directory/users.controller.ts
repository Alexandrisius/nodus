import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createUserSchema,
  listUsersQuerySchema,
  Permission,
  updateMyProfileSchema,
  updateUserSchema,
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
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

/**
 * Справочник сотрудников (`/api/v1/directory/users`).
 * Чтение — directory.read, мутации — directory.manage (RBAC на API, I8);
 * саморедактирование профиля — любому аутентифицированному.
 */
@Controller('directory/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(Permission.DIRECTORY_READ)
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Paginated<UserListItem>> {
    return this.usersService.listUsers(query);
  }

  @Patch('me')
  @Audit({ action: 'directory.user.update_profile', entity: 'user' })
  updateMyProfile(
    @GetUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateMyProfileSchema)) dto: UpdateMyProfileDto,
  ): Promise<UserCard> {
    return this.usersService.updateMyProfile(user.id, dto);
  }

  @Get(':id')
  @RequirePermissions(Permission.DIRECTORY_READ)
  getCard(@Param('id') id: string): Promise<UserCard> {
    return this.usersService.getUserCard(id);
  }

  @Post()
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.user.create', entity: 'user' })
  create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
    @GetUser() actor: AuthUser,
  ): Promise<UserCard> {
    return this.usersService.createUser(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.user.update', entity: 'user' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
    @GetUser() actor: AuthUser,
  ): Promise<UserCard> {
    return this.usersService.updateUser(id, dto, actor.id);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.user.deactivate', entity: 'user' })
  deactivate(@Param('id') id: string, @GetUser() actor: AuthUser): Promise<UserCard> {
    return this.usersService.deactivateUser(id, actor.id);
  }
}
