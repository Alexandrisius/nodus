import { Module } from '@nestjs/common';

import { ORG_STRUCTURE_READER } from '../../core/ports/org-structure.port.js';
import { OrgStructureProvider } from '../../core/ports/org-structure.provider.js';
import { ViewerResolver } from './access/task-visibility.js';
import { TASK_CHAT_READER } from './ports/task-chat-reader.port.js';
import { TaskChatReaderProvider } from './ports/task-chat-reader.provider.js';

/**
 * Порты чтения задач (ADR-0012): тонкий модуль экспорта read-портов чужим
 * модулям (chat — беседа задачи, #252) — единственная допустимая форма
 * межмодульного импорта; доменные сервисы задач не экспортируются.
 */
@Module({
  providers: [
    OrgStructureProvider,
    { provide: ORG_STRUCTURE_READER, useClass: OrgStructureProvider },
    ViewerResolver,
    TaskChatReaderProvider,
    { provide: TASK_CHAT_READER, useClass: TaskChatReaderProvider },
  ],
  exports: [TASK_CHAT_READER],
})
export class TasksPortsModule {}
