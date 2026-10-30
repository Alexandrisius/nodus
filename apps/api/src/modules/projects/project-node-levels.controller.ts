import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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
  ErrorCode,
  Permission,
  nodeLevelCreateBodySchema,
  nodeLevelListSchema,
  nodeLevelSchema,
  nodeLevelUpdateBodySchema,
  type NodeLevel,
  type NodeLevelCreateBody,
  type NodeLevelUpdateBody,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { RequireFeature } from '../../core/decorators/require-feature.decorator.js';
import { RequirePermissions } from '../../core/decorators/require-permissions.decorator.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { TransactionRunner } from '../../core/database/transaction-runner.js';
import { NodeLevelsRepository } from './project-node-levels.repository.js';

const idParamSchema = z.uuid();

/**
 * Справочник видов уровней структуры (#467, ADR-0030 «Дополнение»): ярлык
 * узла — значок + цвет; создание/правка/архивация — `project.setup.manage`
 * («Автоматизация → Типы проектов»). Удаление = архивация: узлы архивного
 * вида не создаются, существующие живут. Имя уникально без учёта регистра
 * и пробелов (lower(btrim(name))). Статический маршрут `projects/node-levels`
 * фармуется раньше параметрических `projects/:id`.
 */
@ApiTags('projects')
@ApiBearerAuth()
@RequireFeature('projects')
@Controller()
export class ProjectNodeLevelsController {
  constructor(
    private readonly nodeLevels: NodeLevelsRepository,
    private readonly txRunner: TransactionRunner,
  ) {}

  @Get('projects/node-levels')
  @ApiOperation({ summary: 'Виды уровней узлов (живые по имени, архивные в конце)' })
  @ApiOkResponse({ standardSchema: nodeLevelListSchema })
  @ApiErrors(400, 401)
  nodeLevelsList(): Promise<NodeLevel[]> {
    return this.nodeLevels.list();
  }

  @Post('projects/node-levels')
  @RequirePermissions(Permission.PROJECT_SETUP_MANAGE)
  @Audit({ action: 'project.node_level_create', entity: 'node_level' })
  @ApiOperation({ summary: 'Новый вид уровня (ярлык узла: значок + цвет)' })
  @ApiCreatedResponse({ standardSchema: nodeLevelSchema })
  @ApiErrors(400, 401, 403, 409)
  @ApiIdempotencyKey()
  nodeLevelCreate(
    @Body({
      schema: nodeLevelCreateBodySchema,
      pipes: [new ZodValidationPipe(nodeLevelCreateBodySchema)],
    })
    dto: NodeLevelCreateBody,
  ): Promise<NodeLevel> {
    return this.txRunner.run(async (tx) => {
      if (await this.nodeLevels.nameTaken(dto.name, null)) {
        throw new DomainException(
          ErrorCode.PROJECT_NODE_LEVEL_NAME_TAKEN,
          'Node level name is already taken',
          { name: dto.name },
        );
      }
      return this.nodeLevels.create(tx, dto);
    });
  }

  @Patch('projects/node-levels/:id')
  @RequirePermissions(Permission.PROJECT_SETUP_MANAGE)
  @Audit({ action: 'project.node_level_update', entity: 'node_level' })
  @ApiParam({ name: 'id', description: 'UUID вида', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ summary: 'Правка вида уровня: имя, значок, цвет' })
  @ApiOkResponse({ standardSchema: nodeLevelSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  nodeLevelUpdate(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Body({
      schema: nodeLevelUpdateBodySchema,
      pipes: [new ZodValidationPipe(nodeLevelUpdateBodySchema)],
    })
    dto: NodeLevelUpdateBody,
  ): Promise<NodeLevel> {
    return this.txRunner.run(async (tx) => {
      if (dto.name !== undefined && (await this.nodeLevels.nameTaken(dto.name, id))) {
        throw new DomainException(
          ErrorCode.PROJECT_NODE_LEVEL_NAME_TAKEN,
          'Node level name is already taken',
          { name: dto.name },
        );
      }
      const updated = await this.nodeLevels.update(tx, id, dto);
      if (!updated) throw DomainException.notFound('Node level not found');
      return updated;
    });
  }

  @Delete('projects/node-levels/:id')
  @RequirePermissions(Permission.PROJECT_SETUP_MANAGE)
  @Audit({ action: 'project.node_level_archive', entity: 'node_level' })
  @ApiParam({ name: 'id', description: 'UUID вида', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    summary: 'Архивировать вид уровня (узлы такого вида больше не создаются)',
  })
  @ApiOkResponse({ standardSchema: nodeLevelSchema })
  @ApiErrors(400, 401, 403, 404)
  nodeLevelArchive(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
  ): Promise<NodeLevel> {
    return this.txRunner.run(async (tx) => {
      const archived = await this.nodeLevels.setArchived(tx, id, true);
      if (!archived) throw DomainException.notFound('Node level not found');
      return archived;
    });
  }

  @Post('projects/node-levels/:id/restore')
  @RequirePermissions(Permission.PROJECT_SETUP_MANAGE)
  @Audit({ action: 'project.node_level_restore', entity: 'node_level' })
  @ApiParam({ name: 'id', description: 'UUID вида', schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ summary: 'Вернуть вид уровня из архива' })
  @ApiOkResponse({ standardSchema: nodeLevelSchema })
  @ApiErrors(400, 401, 403, 404)
  @ApiIdempotencyKey()
  nodeLevelRestore(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
  ): Promise<NodeLevel> {
    return this.txRunner.run(async (tx) => {
      const restored = await this.nodeLevels.setArchived(tx, id, false);
      if (!restored) throw DomainException.notFound('Node level not found');
      return restored;
    });
  }
}
