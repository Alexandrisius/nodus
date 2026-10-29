import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  Permission,
  PROJECT_EVENTS,
  type AuthUser,
  type ProjectMember,
} from '@nodus/contracts';

import {
  TransactionRunner,
  type TransactionClient,
} from '../../core/database/transaction-runner.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { EventBus } from '../../core/events/event-bus.js';
import { encodeCursor } from '../../core/pagination/cursor.util.js';
import { USER_PROFILE_READER, type UserProfileReader } from '../../core/ports/user-profile.port.js';
import {
  TASK_PROJECT_READER,
  type TaskProjectReader,
} from '../tasks/ports/task-project-reader.port.js';
import type { MembershipRow } from './project-access.js';
import {
  ProjectParticipantsRepository,
  type MembersCursor,
} from './project-participants.repository.js';
import { ProjectsRepository } from './projects.repository.js';

/**
 * Двухрежимное участие (Р2): открытый проект — состав живёт из задач
 * (пересчёт по событиям task.*) + вступившие; секретный — ручной состав
 * руководством, задачи состав не расширяют. Здесь же — синк строк
 * руководства при изменении полей проекта и события participants_changed.
 */
@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly projects: ProjectsRepository,
    private readonly participants: ProjectParticipantsRepository,
    @Inject(TASK_PROJECT_READER) private readonly tasks: TaskProjectReader,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
  ) {}

  /** Страница вкладки «Участники» (строки-источники, keyset по user_id). */
  async members(
    user: AuthUser,
    projectId: string,
    cursor: MembersCursor | null,
    limit: number,
  ): Promise<{ items: ProjectMember[]; nextCursor: string | null }> {
    await this.assertVisible(user, projectId);
    const rows = await this.participants.membersPage(projectId, cursor, limit);
    const page = rows.slice(0, limit);
    const userRefs = await this.profiles.findRefs([...new Set(page.map((row) => row.userId))]);
    const users = new Map(userRefs.map((ref) => [ref.id, ref]));
    const items: ProjectMember[] = page.map((row) => ({
      user: users.get(row.userId) ?? { id: row.userId, displayName: '', avatarUrl: null },
      source: row.source as ProjectMember['source'],
      observerKind: (row.observerKind as ProjectMember['observerKind']) ?? null,
      joinedAt: row.createdAt.toISOString(),
    }));
    const nextCursor =
      rows.length > limit && page.length > 0
        ? encodeCursor({
            userId: page[page.length - 1]!.userId,
            source: page[page.length - 1]!.source,
          })
        : null;
    return { items, nextCursor };
  }

  /** «Присоединиться» (открытый, не-участник) — наблюдатель-вступивший. */
  async join(user: AuthUser, projectId: string): Promise<void> {
    const project = await this.projects.findById(projectId);
    if (!project || project.visibility !== 'open') {
      throw DomainException.notFound('Project not found');
    }
    if (project.status === 'archived') {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is archived');
    }
    const mine = await this.participants.rowsOfProject(projectId);
    if (mine.some((row) => row.userId === user.id)) {
      return; // идемпотентно: уже участвует
    }
    await this.txRunner.run(async (tx) => {
      await this.participants.add(tx, [
        { projectId, userId: user.id, source: 'observer', observerKind: 'joined' },
      ]);
      await this.emitChanged(tx, projectId, [user.id]);
    });
  }

  /** «Покинуть» — только свой ряд вступившего наблюдателя. */
  async leave(user: AuthUser, projectId: string): Promise<void> {
    await this.txRunner.run(async (tx) => {
      await this.participants.remove(tx, projectId, [user.id], 'observer');
      await this.emitChanged(tx, projectId, [user.id]);
    });
  }

  /** Ручное добавление руководством: в секретный — участник или наблюдатель,
   *  в открытый — ТОЛЬКО наблюдатель (участники открытого живут из задач,
   *  вердикт владельца 29.10 В2: «задавали наблюдателей для проектов, а
   *  участники добавляются автоматически из задач»). Вторая роль того же
   *  человека заменяется. */
  async addManual(
    user: AuthUser,
    projectId: string,
    targetId: string,
    kind: 'member' | 'observer',
  ): Promise<void> {
    const project = await this.assertManageMembers(user, projectId);
    if (project.visibility !== 'secret' && kind === 'member') {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Open project membership lives from its tasks',
      );
    }
    if (project.status === 'archived') {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is archived');
    }
    const active = await this.profiles.filterActiveUserIds([targetId]);
    if (active.length === 0) throw DomainException.notFound('User not found');
    await this.txRunner.run(async (tx) => {
      await this.participants.remove(
        tx,
        projectId,
        [targetId],
        kind === 'member' ? 'observer' : 'member',
      );
      await this.participants.add(tx, [
        kind === 'member'
          ? { projectId, userId: targetId, source: 'member' }
          : { projectId, userId: targetId, source: 'observer', observerKind: 'invited' },
      ]);
      await this.emitChanged(tx, projectId, [targetId]);
    });
  }

  /** Снятие ручного состава: секретный — участник и наблюдатель; открытый —
   *  только наблюдатель (состав из задач не трогаем). */
  async removeManual(user: AuthUser, projectId: string, targetId: string): Promise<void> {
    const project = await this.assertManageMembers(user, projectId);
    if (project.status === 'archived') {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Project is archived');
    }
    if (project.visibility !== 'secret') {
      await this.txRunner.run(async (tx) => {
        await this.participants.remove(tx, projectId, [targetId], 'observer');
        await this.emitChanged(tx, projectId, [targetId]);
      });
      return;
    }
    // Сотрудник с ролями в задачах проекта остаётся адресатом уведомлений и
    // push даже после снятия участия — сначала снимите его с задач (иначе
    // заголовки секретных задач продолжают утекать).
    if ((await this.tasks.roleHolderIds(projectId)).includes(targetId)) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Remove the employee from the project tasks first',
        { userId: targetId },
      );
    }
    await this.txRunner.run(async (tx) => {
      await this.participants.remove(tx, projectId, [targetId], 'member');
      await this.participants.remove(tx, projectId, [targetId], 'observer');
      await this.emitChanged(tx, projectId, [targetId]);
    });
  }

  /** Пересчёт источника `task` открытого проекта по событию задачи (Р2);
   *  идемпотентен, вне транзакции отправителя. */
  async recomputeTaskSource(projectId: string): Promise<void> {
    const project = await this.projects.findById(projectId);
    if (!project || project.visibility !== 'open') return;
    const members = await this.tasks.membersOf(projectId);
    await this.txRunner.run(async (tx) => {
      const { added, removed } = await this.participants.replaceTaskSource(tx, projectId, members);
      if (added.length > 0 || removed.length > 0) {
        await this.emitChanged(tx, projectId, [...new Set([...added, ...removed])]);
      }
    });
  }

  /** Синк строк руководства (create/update/transfer) + событие об изменении. */
  async syncManagement(
    tx: TransactionClient,
    projectId: string,
    management: { managerId: string; assistantIds: readonly string[] },
    extraChanged: readonly string[] = [],
  ): Promise<void> {
    const { added, removed } = await this.participants.syncManagement(tx, projectId, management);
    const changed = [...new Set([...added, ...removed, ...extraChanged])];
    if (changed.length > 0) await this.emitChanged(tx, projectId, changed);
  }

  /** Сбор строк руководства после смены видимости: open→secret — динамика
   *  задач снимается (состав секретного полностью ручной); secret→open —
   *  пересчитывается из живых задач. */
  async onVisibilityChanged(projectId: string, visibility: 'open' | 'secret'): Promise<void> {
    if (visibility === 'secret') {
      await this.txRunner.run(async (tx) => {
        const rows = await this.participants.rowsOfProject(projectId);
        const taskUsers = rows.filter((row) => row.source === 'task').map((row) => row.userId);
        if (taskUsers.length === 0) return;
        await this.participants.remove(tx, projectId, taskUsers, 'task');
        await this.emitChanged(tx, projectId, taskUsers);
      });
      return;
    }
    await this.recomputeTaskSource(projectId);
  }

  /** Событие изменения состава + подъём активности проекта (Т2). */
  async emitChanged(
    tx: TransactionClient,
    projectId: string,
    changedUserIds: readonly string[],
  ): Promise<void> {
    await this.eventBus.emit(
      tx,
      PROJECT_EVENTS.PARTICIPANTS_CHANGED,
      { projectId, changedUserIds: [...new Set(changedUserIds)] },
      { aggregateType: 'project', aggregateId: projectId },
    );
    await this.projects.touch(tx, projectId);
  }

  /** Секретный проект виден участию/надзору; открытый — всем (404 без
   *  оракула, паттерн letter-access). */
  async assertVisible(user: AuthUser, projectId: string) {
    const project = await this.projects.findById(projectId);
    if (!project) throw DomainException.notFound('Project not found');
    if (project.visibility === 'secret') {
      const participant = await this.participants.hasRow(projectId, user.id);
      const supervisor = participant || user.permissions.includes(Permission.PROJECT_VIEW_SECRET);
      if (!supervisor) throw DomainException.notFound('Project not found');
    }
    return project;
  }

  async membershipOf(projectId: string): Promise<MembershipRow[]> {
    return this.participants.rowsOfProject(projectId);
  }

  private async assertManageMembers(user: AuthUser, projectId: string) {
    // Видимость — ДО прав: секретный проект не-участнику отдаёт 404 без
    // оракула существования (Т1), как карточка и состав.
    const project = await this.assertVisible(user, projectId);
    const membership = await this.participants.rowsOfProject(projectId);
    const mine = membership.filter((row) => row.userId === user.id);
    const isManagement = mine.some((row) => row.source === 'manager' || row.source === 'assistant');
    if (!isManagement && !user.permissions.includes(Permission.PROJECT_MANAGE)) {
      throw DomainException.forbidden('Only project management can manage members');
    }
    return project;
  }
}
