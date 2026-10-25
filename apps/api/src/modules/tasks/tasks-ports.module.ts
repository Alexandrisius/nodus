import { Module } from '@nestjs/common';

import { ORG_STRUCTURE_READER } from '../../core/ports/org-structure.port.js';
import { OrgStructureProvider } from '../../core/ports/org-structure.provider.js';
import { ViewerResolver } from './access/task-visibility.js';
import { CUSTOM_FIELD_VALUES_READER } from './ports/custom-field-values.port.js';
import { TaskCustomFieldValuesProvider } from './ports/custom-field-values.provider.js';
import { TASK_CHAT_READER } from './ports/task-chat-reader.port.js';
import { TaskChatReaderProvider } from './ports/task-chat-reader.provider.js';
import { TasksQueryRepository } from './tasks/tasks-query.repository.js';

/**
 * Порты чтения задач (ADR-0012): тонкий модуль экспорта read-портов чужим
 * модулям (chat — беседа задачи, #252; custom-fields — значения атрибутов
 * для окна удаления, #431) — единственная допустимая форма межмодульного
 * импорта; доменные сервисы задач не экспортируются.
 */
@Module({
  providers: [
    OrgStructureProvider,
    { provide: ORG_STRUCTURE_READER, useClass: OrgStructureProvider },
    ViewerResolver,
    TasksQueryRepository,
    TaskChatReaderProvider,
    { provide: TASK_CHAT_READER, useClass: TaskChatReaderProvider },
    TaskCustomFieldValuesProvider,
    { provide: CUSTOM_FIELD_VALUES_READER, useClass: TaskCustomFieldValuesProvider },
  ],
  exports: [TASK_CHAT_READER, CUSTOM_FIELD_VALUES_READER],
})
export class TasksPortsModule {}
