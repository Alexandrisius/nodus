import { Module } from '@nestjs/common';

import { ORG_STRUCTURE_READER } from '../../core/ports/org-structure.port.js';
import { OrgStructureProvider } from '../../core/ports/org-structure.provider.js';
import { USER_PROFILE_READER } from '../../core/ports/user-profile.port.js';
import { UserProfileProvider } from '../../core/ports/user-profile.provider.js';
import { ChatPortsModule } from '../chat/chat-ports.module.js';
import { ViewerResolver } from './access/task-visibility.js';
import { HistoryService } from './activity/history.service.js';
import { RelationsService } from './activity/relations.service.js';
import { ResultsService } from './activity/results.service.js';
import { TaskPartsController } from './activity/task-parts.controller.js';
import { BulkService } from './bulk/bulk.service.js';
import { CatalogBootstrap } from './catalog/catalog.bootstrap.js';
import { ChecklistService } from './checklist/checklist.service.js';
import {
  TaskCommentDeletedHandler,
  TaskCommentSentHandler,
  TaskCommentsCounter,
} from './events/comments-count.handler.js';
import { OverdueScanner } from './events/overdue.scanner.js';
import { ParticipantsService } from './participants/participants.service.js';
import { PersonalStagesService } from './personal/personal-stages.service.js';
import { Placements } from './personal/placements.js';
import { TaskDtoMapper } from './tasks/task-dto.mapper.js';
import { TaskEditService } from './tasks/task-edit.service.js';
import { TasksController } from './tasks/tasks.controller.js';
import { TasksQueryService } from './tasks/tasks-query.service.js';
import { TasksRepository } from './tasks/tasks.repository.js';
import { TasksService } from './tasks/tasks.service.js';
import { TimeController } from './time/time.controller.js';
import { TimeService } from './time/time.service.js';
import { TaskWorkflowController } from './workflow/task-workflow.controller.js';
import { TransitionsService } from './workflow/transitions.service.js';
import { WorkflowRepository } from './workflow/workflow.repository.js';

/**
 * Модуль tasks (#37, эпик M4 #49; ADR-0008, ADR-0020): самостоятельные
 * задачи (проект необязателен), движок маршрутов с гейтами DoR/DoD,
 * «Мой план», участники, чек-лист, время, результат, связи, история, bulk.
 * Изоляция (I3/I6): профили и оргструктура — read-порты core (ADR-0012);
 * чат задачи — модуль chat по событиям task.* (#252). Флаг `tasks` (I10).
 */
@Module({
  // Read-порты чата (ADR-0012): доступ к сообщению для «В задачу»/результата.
  imports: [ChatPortsModule],
  controllers: [TasksController, TaskWorkflowController, TaskPartsController, TimeController],
  providers: [
    UserProfileProvider,
    { provide: USER_PROFILE_READER, useClass: UserProfileProvider },
    OrgStructureProvider,
    { provide: ORG_STRUCTURE_READER, useClass: OrgStructureProvider },
    CatalogBootstrap,
    ViewerResolver,
    WorkflowRepository,
    TransitionsService,
    Placements,
    TasksRepository,
    TaskDtoMapper,
    TasksQueryService,
    TasksService,
    TaskEditService,
    PersonalStagesService,
    ParticipantsService,
    ChecklistService,
    TimeService,
    ResultsService,
    RelationsService,
    HistoryService,
    BulkService,
    OverdueScanner,
    // Счётчик комментариев = сообщения беседы задачи (#252, события chat.*).
    TaskCommentsCounter,
    TaskCommentSentHandler,
    TaskCommentDeletedHandler,
  ],
})
export class TasksModule {}
