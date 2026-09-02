import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type AuthUser,
  createPositionSchema,
  orgUnitKindSchema,
  Permission,
  updatePositionSchema,
  type CreatePositionDto,
  type OrgUnitKind,
  type Position,
  type UpdatePositionDto,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { PositionsService } from './positions.service.js';

const listQuerySchema = z.object({
  kind: orgUnitKindSchema.default('management'),
  includeArchived: z.stringbool().default(false),
});

/** Должности (`/api/v1/directory/positions`): справочник, CRUD, архивация. */
@Controller('directory/positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @RequirePermissions(Permission.DIRECTORY_READ)
  list(
    @Query(new ZodValidationPipe(listQuerySchema))
    query: {
      kind: OrgUnitKind;
      includeArchived: boolean;
    },
  ): Promise<Position[]> {
    return this.positionsService.list(query.kind, query.includeArchived);
  }

  @Post()
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.position.create', entity: 'position' })
  create(
    @Body(new ZodValidationPipe(createPositionSchema)) dto: CreatePositionDto,
    @GetUser() actor: AuthUser,
  ): Promise<Position> {
    return this.positionsService.create(dto, actor.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.position.update', entity: 'position' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePositionSchema)) dto: UpdatePositionDto,
    @GetUser() actor: AuthUser,
  ): Promise<Position> {
    return this.positionsService.update(id, dto, actor.id);
  }

  @Post(':id/archive')
  @HttpCode(204)
  @RequirePermissions(Permission.DIRECTORY_MANAGE)
  @Audit({ action: 'directory.position.archive', entity: 'position' })
  archive(@Param('id') id: string, @GetUser() actor: AuthUser): Promise<void> {
    return this.positionsService.archive(id, actor.id);
  }
}
