import { Module } from '@nestjs/common';

import { DepartmentsController } from './departments.controller.js';
import { DepartmentsRepository } from './departments.repository.js';
import { DepartmentsService } from './departments.service.js';
import { PositionsController } from './positions.controller.js';
import { PositionsRepository } from './positions.repository.js';
import { PositionsService } from './positions.service.js';
import { RolesController } from './roles.controller.js';
import { RolesRepository } from './roles.repository.js';
import { RolesService } from './roles.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

/**
 * Модуль directory (ядро): пользователи, отделы (дерево, оба kind),
 * должности, роли. Провайдеры не экспортируются — другие модули
 * интегрируются событиями `directory.user.*` и `@nodus/contracts` (I3/I6).
 */
@Module({
  controllers: [UsersController, DepartmentsController, PositionsController, RolesController],
  providers: [
    UsersService,
    UsersRepository,
    DepartmentsService,
    DepartmentsRepository,
    PositionsService,
    PositionsRepository,
    RolesService,
    RolesRepository,
  ],
})
export class DirectoryModule {}
