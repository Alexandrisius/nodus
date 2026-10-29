import { Injectable } from '@nestjs/common';
import { ErrorCode, Permission, type ProjectRef } from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { FeatureFlagService } from '../../../core/feature-flags/feature-flag.service.js';
import { ProjectParticipantsRepository } from '../project-participants.repository.js';
import { ProjectsRepository } from '../projects.repository.js';
import type {
  ProjectActor,
  ProjectChatReader,
  ProjectReader,
  ProjectViewScope,
} from './project-reader.port.js';

const EMPTY_SCOPE: ProjectViewScope = { visibleProjectIds: [], hiddenProjectIds: [] };
/** TTL кэша множеств видимости (Р3): паттерн feature-flag.service.ts. */
const SCOPE_TTL_MS = 5_000;

/**
 * Реализация read-портов проектов (ADR-0012). Флаг `projects` выключен —
 * порты нейтральны: пустые множества, refs без строк, проверки пропускают
 * (I10 — задачи и письма не должны зависеть от подъёма модуля).
 */
@Injectable()
export class ProjectReaderProvider implements ProjectReader, ProjectChatReader {
  private readonly scopeCache = new Map<string, { scope: ProjectViewScope; expiresAt: number }>();

  constructor(
    private readonly projects: ProjectsRepository,
    private readonly participants: ProjectParticipantsRepository,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  private async enabled(): Promise<boolean> {
    return this.featureFlags.isEnabled('projects');
  }

  async refsFor(actor: ProjectActor, ids: readonly string[]): Promise<ProjectRef[]> {
    if (ids.length === 0) return [];
    if (!(await this.enabled())) return [];
    const scope = await this.viewScopeFor(actor);
    const visible = new Set(scope.visibleProjectIds);
    const found = await this.projects.refsByIds([...ids]);
    return found.filter((ref) => visible.has(ref.id));
  }

  async viewScopeFor(actor: ProjectActor): Promise<ProjectViewScope> {
    if (!(await this.enabled())) return EMPTY_SCOPE;
    const cached = this.scopeCache.get(actor.id);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.scope;
    const scope = await this.buildScope(actor);
    this.scopeCache.set(actor.id, { scope, expiresAt: now + SCOPE_TTL_MS });
    return scope;
  }

  private async buildScope(actor: ProjectActor): Promise<ProjectViewScope> {
    const myProjectIds = await this.projects.participantProjectIds(actor.id);
    const mine = new Set(myProjectIds);
    const seeSecret = actor.permissions.includes(Permission.PROJECT_VIEW_SECRET);
    const openIds = await this.projects.openProjectIds();
    const secretIds = await this.projects.secretProjectIds();
    const visible = seeSecret
      ? [...new Set([...openIds, ...secretIds])]
      : [...new Set([...openIds, ...myProjectIds])];
    const hidden = seeSecret ? [] : secretIds.filter((id) => !mine.has(id));
    return { visibleProjectIds: visible, hiddenProjectIds: hidden };
  }

  async assertTaskProjectVisible(actor: ProjectActor, projectId: string): Promise<void> {
    if (!(await this.enabled())) return;
    const scope = await this.viewScopeFor(actor);
    if (!scope.visibleProjectIds.includes(projectId)) {
      // Без оракула секретности: скрытый и несуществующий — один ответ (Т1).
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is not available', {
        projectId,
      });
    }
  }

  async assertMembersAllowed(projectId: string, userIds: readonly string[]): Promise<void> {
    if (!(await this.enabled())) return;
    const project = await this.projects.findById(projectId);
    if (!project) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is not available', {
        projectId,
      });
    }
    if (project.status === 'archived') {
      // Архив — заморозка: новых задач нет (Р1).
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is archived', {
        projectId,
      });
    }
    if (project.visibility !== 'secret') return;
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    const rows = await this.participants.rowsOfProject(projectId);
    const members = new Set(rows.map((row) => row.userId));
    const outsiders = unique.filter((id) => !members.has(id));
    if (outsiders.length > 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Task members must be project participants (secret project)',
        { projectId, userIds: outsiders },
      );
    }
  }

  async projectTaskRights(actorId: string, projectId: string): Promise<{ supervisor: boolean }> {
    if (!(await this.enabled())) return { supervisor: false };
    return { supervisor: await this.participants.isManagement(projectId, actorId) };
  }

  // ===== ProjectChatReader (Р8) =====

  async roster(projectId: string): Promise<{ managerId: string; memberIds: string[] } | null> {
    if (!(await this.enabled())) return null;
    const project = await this.projects.findById(projectId);
    if (!project) return null;
    const memberIds = await this.participants.rosterUserIds(projectId);
    return { managerId: project.managerId, memberIds };
  }

  async canView(projectId: string, actor: ProjectActor): Promise<boolean> {
    if (!(await this.enabled())) return false;
    const project = await this.projects.findById(projectId);
    if (!project) return false;
    if (project.visibility === 'open') return true;
    return (
      (await this.participants.hasRow(projectId, actor.id)) ||
      actor.permissions.includes(Permission.PROJECT_VIEW_SECRET)
    );
  }

  async canPost(projectId: string, actor: ProjectActor): Promise<boolean> {
    if (!(await this.enabled())) return false;
    if (actor.permissions.includes(Permission.PROJECT_CHANNEL_POST)) return true;
    return this.participants.isManagement(projectId, actor.id);
  }

  async refs(ids: readonly string[]): Promise<ProjectRef[]> {
    if (ids.length === 0 || !(await this.enabled())) return [];
    return this.projects.refsByIds([...ids]);
  }
}
