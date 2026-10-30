import { Module } from '@nestjs/common';

import { ProjectParticipantsRepository } from './project-participants.repository.js';
import { ProjectNodesRepository } from './project-nodes.repository.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectReaderProvider } from './ports/project-reader.provider.js';
import { PROJECT_CHAT_READER, PROJECT_READER } from './ports/project-reader.port.js';
import {
  ProjectCreatedScopeHandler,
  ProjectParticipantsScopeHandler,
  ProjectUpdatedScopeHandler,
  ProjectScopeInvalidateRunner,
} from './ports/scope-invalidation.handler.js';

/**
 * Порты чтения проектов (ADR-0012): тонкий модуль экспорта read-портов
 * чужим модулям-потребителям (#52 Р11 — задачи, корреспонденция,
 * custom-fields, chat). Единственная допустимая форма межмодульного
 * импорта; доменные сервисы и контроллеры наружу не экспортируются.
 */
@Module({
  providers: [
    ProjectsRepository,
    ProjectParticipantsRepository,
    ProjectNodesRepository,
    ProjectReaderProvider,
    { provide: PROJECT_READER, useExisting: ProjectReaderProvider },
    { provide: PROJECT_CHAT_READER, useExisting: ProjectReaderProvider },
    // Сброс кэша множеств видимости по событиям проектов (Р3).
    ProjectScopeInvalidateRunner,
    ProjectCreatedScopeHandler,
    ProjectUpdatedScopeHandler,
    ProjectParticipantsScopeHandler,
  ],
  exports: [PROJECT_READER, PROJECT_CHAT_READER],
})
export class ProjectsPortsModule {}
