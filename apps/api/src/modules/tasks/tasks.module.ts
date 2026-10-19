import { Module } from '@nestjs/common';

import { ORG_STRUCTURE_READER } from '../../core/ports/org-structure.port.js';
import { OrgStructureProvider } from '../../core/ports/org-structure.provider.js';
import { USER_PROFILE_READER } from '../../core/ports/user-profile.port.js';
import { UserProfileProvider } from '../../core/ports/user-profile.provider.js';
import { ChatPortsModule } from '../chat/chat-ports.module.js';
import { ViewerResolver } from './access/task-visibility.js';
import { HistoryRepository } from './activity/history.repository.js';
import { HistoryService } from './activity/history.service.js';
import { RelationsRepository } from './activity/relations.repository.js';
import { RelationsService } from './activity/relations.service.js';
import { ResultsRepository } from './activity/results.repository.js';
import { ResultsService } from './activity/results.service.js';
import { TaskPartsController } from './activity/task-parts.controller.js';
import { BulkService } from './bulk/bulk.service.js';
import { CatalogBootstrap } from './catalog/catalog.bootstrap.js';
import { CatalogRepository } from './catalog/catalog.repository.js';
import { ChecklistRepository } from './checklist/checklist.repository.js';
import { ChecklistService } from './checklist/checklist.service.js';
import {
  TaskCommentDeletedHandler,
  TaskCommentSentHandler,
  TaskCommentsCounter,
} from './events/comments-count.handler.js';
import { OverdueScanner } from './events/overdue.scanner.js';
import { ParticipantsRepository } from './participants/participants.repository.js';
import { ParticipantsService } from './participants/participants.service.js';
import { PersonalStagesRepository } from './personal/personal-stages.repository.js';
import { PersonalStagesService } from './personal/personal-stages.service.js';
import { Placements } from './personal/placements.js';
import { PlacementsRepository } from './personal/placements.repository.js';
import { TaskDtoMapper } from './tasks/task-dto.mapper.js';
import { TaskEditService } from './tasks/task-edit.service.js';
import { TasksController } from './tasks/tasks.controller.js';
import { TasksQueryRepository } from './tasks/tasks-query.repository.js';
import { TasksQueryService } from './tasks/tasks-query.service.js';
import { TasksRepository } from './tasks/tasks.repository.js';
import { TasksService } from './tasks/tasks.service.js';
import { TimeEntriesRepository } from './time/time-entries.repository.js';
import { TimeController } from './time/time.controller.js';
import { TimeService } from './time/time.service.js';
import { TaskWorkflowController } from './workflow/task-workflow.controller.js';
import { TransitionsService } from './workflow/transitions.service.js';
import { WorkflowRepository } from './workflow/workflow.repository.js';
import { StageMover } from './workflow/stage-mover.js';
import { WorkflowEditorController } from './workflow/editor/workflow-editor.controller.js';
import { WorkflowEditorService } from './workflow/editor/publish.service.js';
import { WorkflowSyncJob } from './workflow/editor/workflow-sync.job.js';
import { TaskTypesController } from './types/task-types.controller.js';
import { TaskTypesRepository } from './types/task-types.repository.js';
import { TaskTypesService } from './types/task-types.service.js';
import { TaskTypeChangeService } from './types/task-type-change.service.js';

/**
 * Модуль tasks (#37, эпик M4 #49; ADR-0008, ADR-0020): самостоятельные
 * задачи (проект необязателен), движок маршрутов с гейтами DoR/DoD,
 * «Мой план», участники, чек-лист, время, результат, связи, история, bulk.
 * Редактор маршрутов и библиотека типов (#378, ADR-0021) — та же композиция
 * API модуля (I13, отдельный backend-модуль не заводим). Изоляция (I3/I6):
 * профили и оргструктура — read-порты core (ADR-0012); чат задачи — модуль
 * chat по событиям task.* (#252). Флаг `tasks` (I10).
 */
@Module({
  // Read-порты чата (ADR-0012): доступ к сообщению для «В задачу»/результата.
  imports: [ChatPortsModule],
  controllers: [
    TasksController,
    TaskWorkflowController,
    TaskPartsController,
    TimeController,
    TaskTypesController,
    WorkflowEditorController,
  ],
  providers: [
    UserProfileProvider,
    { provide: USER_PROFILE_READER, useClass: UserProfileProvider },
    OrgStructureProvider,
    { provide: ORG_STRUCTURE_READER, useClass: OrgStructureProvider },
    // Репозитории — единственная точка доступа к таблицам модуля (patterns.md).
    CatalogRepository,
    WorkflowRepository,
    TaskTypesRepository,
    TasksRepository,
    TasksQueryRepository,
    PlacementsRepository,
    PersonalStagesRepository,
    ParticipantsRepository,
    ChecklistRepository,
    TimeEntriesRepository,
    ResultsRepository,
    RelationsRepository,
    HistoryRepository,
    CatalogBootstrap,
    ViewerResolver,
    StageMover,
    TransitionsService,
    WorkflowEditorService,
    WorkflowSyncJob,
    TaskTypesService,
    TaskTypeChangeService,
    Placements,
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
