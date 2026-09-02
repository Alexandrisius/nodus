import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type AuthUser,
  createDepartmentSchema,
  orgUnitKindSchema,
  Permission,
  updateDepartmentSchema,
  type CreateDepartmentDto,
  type DepartmentNode,
  type OrgUnitKind,
  type UpdateDepartmentDto,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { DepartmentsService } from './departments.service.js';

const treeQuerySchema = z.object({
  kind: orgUnitKindSchema.default('management'),
});

/** Оргструктура (`/api/v1/directory/departments`): дерево, CRUD, архивация. */
@Controller('directory/departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get('tree')
  @RequirePermissions(Permission.DIRECTORY_READ)
  tree(
    @Query(new ZodValidationPipe(treeQuerySchema)) query: { kind: OrgUnitKind },
  ): Promise<DepartmentNode[]> {
    return this.departmentsService.getTree(query.kind);
  }

  @Get(':id')
  @RequirePermissions(Permission.DIRECTORY_READ)
  getById(@Param('id') id: string): Promise<DepartmentNode> {
    return this.departmentsService.getById(id);
  }

  @Post()
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.department.create', entity: 'department' })
  create(
    @Body(new ZodValidationPipe(createDepartmentSchema)) dto: CreateDepartmentDto,
    @GetUser() actor: AuthUser,
  ): Promise<DepartmentNode> {
    return this.departmentsService.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.department.update', entity: 'department' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) dto: UpdateDepartmentDto,
    @GetUser() actor: AuthUser,
  ): Promise<DepartmentNode> {
    return this.departmentsService.update(id, dto, actor.id);
  }

  @Post(':id/archive')
  @HttpCode(204)
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.department.archive', entity: 'department' })
  archive(@Param('id') id: string, @GetUser() actor: AuthUser): Promise<void> {
    return this.departmentsService.archive(id, actor.id);
  }
}
