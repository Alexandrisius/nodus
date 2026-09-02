import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
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
  roleSchema,
  type AuthUser,
  createRoleSchema,
  Permission,
  updateRoleSchema,
  type CreateRoleDto,
  type Role,
  type UpdateRoleDto,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { RolesService } from './roles.service.js';

/** Роли RBAC (`/api/v1/directory/roles`): чтение — directory.read, управление — role.manage. */
@ApiTags('directory')
@ApiBearerAuth()
@Controller('directory/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

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
  @ApiErrors(401, 403, 404)
  getById(@Param('id') id: string): Promise<Role> {
    return this.rolesService.getRole(id);
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
    return this.rolesService.createRole(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.update', entity: 'role' })
  @ApiOperation({ summary: 'Обновление роли' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ standardSchema: roleSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  update(
    @Param('id') id: string,
    @Body({ schema: updateRoleSchema, pipes: [new ZodValidationPipe(updateRoleSchema)] })
    dto: UpdateRoleDto,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.updateRole(id, dto, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.delete', entity: 'role' })
  @ApiOperation({ summary: 'Удаление роли (системные не удаляются)' })
  @ApiParam({ name: 'id', description: 'UUID роли', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Роль удалена' })
  @ApiErrors(401, 403, 404, 409)
  @ApiIdempotencyKey()
  delete(@Param('id') id: string, @GetUser() actor: AuthUser): Promise<void> {
    return this.rolesService.deleteRole(id, actor.id);
  }
}
