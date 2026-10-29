import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowActorRole } from '@nodus/contracts';

import { PROJECT_READER, type ProjectReader } from '../../projects/ports/project-reader.port.js';

/**
 * Права руководства проекта на задачи (#52 Р12, вердикт 29.10):
 * руководитель и помощники проекта получают уровень постановщика на все
 * его задачи — закрывать забытые, удалять ненужные, править поля. Роль
 * `creator` в терминах ролей задачи/движка — единая точка: переходы,
 * гейты, правка и удаление меряют одни и те же роли. Порт нейтрален при
 * выключенном флаге `projects` (supervisor=false, I10).
 */
@Injectable()
export class TaskProjectRights {
  constructor(@Inject(PROJECT_READER) private readonly projects: ProjectReader) {}

  /** Добавляет роль постановщика, если актёр руководит проектом задачи. */
  async supplement(
    roles: Set<WorkflowActorRole>,
    actorId: string,
    projectId: string | null,
  ): Promise<Set<WorkflowActorRole>> {
    if (!projectId) return roles;
    const { supervisor } = await this.projects.projectTaskRights(actorId, projectId);
    if (supervisor) roles.add('creator');
    return roles;
  }
}
