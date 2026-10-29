import { ErrorCode, type AuthUser } from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';
import type { ProjectsService } from './projects.service.js';

/**
 * Гард мутаций структуры (#467): права = правке полей проекта (руководство
 * или project.manage, ProjectsService.loadForManage); архивный проект
 * заморожен — узлы не меняются (400). Общий для сервиса структуры и сервиса
 * переносов — инвариант один, точка одна.
 */
export async function loadForStructureManage(
  projects: ProjectsService,
  user: AuthUser,
  projectId: string,
) {
  const { row } = await projects.loadForManage(user, projectId);
  if (row.status === 'archived') {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is archived', { projectId });
  }
  return { row };
}
