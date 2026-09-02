import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
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
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { RolesService } from './roles.service.js';

/** Роли RBAC (`/api/v1/directory/roles`): чтение — directory.read, управление — role.manage. */
@Controller('directory/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(Permission.DIRECTORY_READ)
  list(): Promise<Role[]> {
    return this.rolesService.listRoles();
  }

  @Get(':id')
  @RequirePermissions(Permission.DIRECTORY_READ)
  getById(@Param('id') id: string): Promise<Role> {
    return this.rolesService.getRole(id);
  }

  @Post()
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.create', entity: 'role' })
  create(
    @Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleDto,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.createRole(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.update', entity: 'role' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
    @GetUser() actor: AuthUser,
  ): Promise<Role> {
    return this.rolesService.updateRole(id, dto, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.ROLE_MANAGE)
  @Audit({ action: 'directory.role.delete', entity: 'role' })
  delete(@Param('id') id: string, @GetUser() actor: AuthUser): Promise<void> {
    return this.rolesService.deleteRole(id, actor.id);
  }
}
