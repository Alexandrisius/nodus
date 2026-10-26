import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  roleMembersSchema,
  roleSchema,
  type AuthUser,
  createRoleSchema,
  Permission,
  permissionSchema,
  updateRoleSchema,
  type CreateRoleDto,
  type Role,
  type RoleMembers,
  type UpdateRoleDto,
} from '@nodus/contracts';
import { z } from 'zod';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { RoleMembersService } from './role-members.service.js';
import { RolesService } from './roles.service.js';

const UUID_PIPE = new ZodValidationPipe(z.uuid());

/**
 * Роли RBAC (`/api/v1/directory/roles`): чтение — `directory.read`,
 * управление — `role.manage`. Точечные права (`PUT/DELETE …/permissions/:p`)
 * и состав (`…/members/users|departments/:id`) — #379, ADR-0034.
 */
@ApiTags('directory')
@ApiBearerAuth()
@Controller('directory/roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly membersService: RoleMembersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.DIRECTORY_READ)
  @ApiOperation({ summary: 'Список ролей' })
  @ApiOkResponse({ standardSchema: roleSchema, isArray: true })
  @ApiErrors(401, 403)
  list(): Promise<Role[]> {
    return this.rolesService.listRoles();
  }

  @Get(':id')
  @RequirePermissions(Permission.DIRECTORY_READ)
  @ApiOperation({ summary: 'Роль по идентификатору' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404)
  getById(@Param('id', UUID_PIPE) id: string): Promise<Role> {
    return this.rolesService.getRole(id);
  }

  @Get(':id/members')
  @RequirePermissions(Permission.DIRECTORY_READ)
  @ApiOperation({ summary: 'Состав роли: сотрудники и подразделения' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ standardSchema: roleMembersSchema })
  @ApiErrors(400, 401, 403, 404)
  listMembers(@Param('id', UUID_PIPE) id: string): Promise<RoleMembers> {
    return this.membersService.listMembers(id);
  }

  @Post()
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.create', entity: 'role' })
  @ApiOperation({ summary: 'Создание роли' })
  @ApiCreatedResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 409)
  @ApiIdempotencyKey()
  create(
    @Body({ schema: createRoleSchema, pipes: [new ZodValidationPipe(createRoleSchema)] })
    dto: CreateRoleDto,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.createRole(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.update', entity: 'role' })
  @ApiOperation({ summary: 'Обновление роли (имя, описание, набор прав)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  update(
    @Param('id', UUID_PIPE) id: string,
    @Body({ schema: updateRoleSchema, pipes: [new ZodValidationPipe(updateRoleSchema)] })
    dto: UpdateRoleDto,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.updateRole(id, dto, actor);
  }

  @Put(':id/permissions/:permission')
  @HttpCode(200)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.permission_grant', entity: 'role' })
  @ApiOperation({ summary: 'Выдать право роли (идемпотентно)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'permission', description: 'Право каталога', enum: Object.values(Permission) })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  grantPermission(
    @Param('id', UUID_PIPE) id: string,
    @Param('permission', new ZodValidationPipe(permissionSchema)) permission: Permission,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.setPermission(id, permission, true, actor);
  }

  @Delete(':id/permissions/:permission')
  @HttpCode(200)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.permission_revoke', entity: 'role' })
  @ApiOperation({ summary: 'Отозвать право роли (идемпотентно)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'permission', description: 'Право каталога', enum: Object.values(Permission) })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  revokePermission(
    @Param('id', UUID_PIPE) id: string,
    @Param('permission', new ZodValidationPipe(permissionSchema)) permission: Permission,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.setPermission(id, permission, false, actor);
  }

  @Put(':id/members/users/:userId')
  @HttpCode(200)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.member_add', entity: 'role' })
  @ApiOperation({ summary: 'Добавить сотрудника в роль (идемпотентно)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({
    name: 'userId',
    description: 'UUID сотрудника',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  addUser(
    @Param('id', UUID_PIPE) id: string,
    @Param('userId', UUID_PIPE) userId: string,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.membersService.setUserMember(id, userId, true, actor);
  }

  @Delete(':id/members/users/:userId')
  @HttpCode(200)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.member_remove', entity: 'role' })
  @ApiOperation({ summary: 'Убрать сотрудника из роли (идемпотентно)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({
    name: 'userId',
    description: 'UUID сотрудника',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  removeUser(
    @Param('id', UUID_PIPE) id: string,
    @Param('userId', UUID_PIPE) userId: string,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.membersService.setUserMember(id, userId, false, actor);
  }

  @Put(':id/members/departments/:departmentId')
  @HttpCode(200)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.member_add', entity: 'role' })
  @ApiOperation({ summary: 'Привязать роль к подразделению (идемпотентно)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({
    name: 'departmentId',
    description: 'UUID подразделения',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  addDepartment(
    @Param('id', UUID_PIPE) id: string,
    @Param('departmentId', UUID_PIPE) departmentId: string,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.membersService.setDepartmentMember(id, departmentId, true, actor);
  }

  @Delete(':id/members/departments/:departmentId')
  @HttpCode(200)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.member_remove', entity: 'role' })
  @ApiOperation({ summary: 'Снять привязку роли к подразделению (идемпотентно)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({
    name: 'departmentId',
    description: 'UUID подразделения',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  removeDepartment(
    @Param('id', UUID_PIPE) id: string,
    @Param('departmentId', UUID_PIPE) departmentId: string,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.membersService.setDepartmentMember(id, departmentId, false, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.delete', entity: 'role' })
  @ApiOperation({ summary: 'Удаление роли (системные и назначенные не удаляются)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Роль удалена' })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  delete(@Param('id', UUID_PIPE) id: string, @GetUser() actor: AuthUser): Promise<void> {
    return this.rolesService.deleteRole(id, actor.id);
  }
}
