import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  Permission,
  type AuthUser,
  type ListProjectsQuery,
  type ProjectDetail,
  type ProjectListItem,
} from '@nodus/contracts';

import { DomainException } from '../../core/errors/domain-exception.js';
import { ProjectDtoMapper } from './project-dto.mapper.js';
import { ProjectParticipantsRepository } from './project-participants.repository.js';
import { ProjectsRepository, type ProjectListCursor } from './projects.repository.js';

/**
 * Журнал и карточка проектов (чтение, #52): вынесено из ProjectsService
 * (лимит ответственности файла). Журнал — видимый срез (открытые +
 * секретные участия; view_secret видит всё) с фильтрами и keyset-курсором.
 */
@Injectable()
export class ProjectsQueryService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly participantsRepo: ProjectParticipantsRepository,
    private readonly mapper: ProjectDtoMapper,
  ) {}

  async list(
    user: AuthUser,
    query: ListProjectsQuery,
  ): Promise<{ items: ProjectListItem[]; nextCursor: string | null }> {
    const myProjectIds = await this.repo.participantProjectIds(user.id);
    const roleSource =
      query.role === undefined
        ? null
        : query.role === 'participant'
          ? ['task', 'member']
          : [query.role];
    const filter = {
      participantOf: query.scope === 'mine' || query.role !== undefined ? user.id : null,
      roleSource,
      myProjectIds,
      seeAll: user.permissions.includes(Permission.PROJECT_VIEW_SECRET),
      search: query.search,
      visibility: query.visibility,
      status: query.status,
      portfolioId: query.portfolioId,
      clientId: query.clientId,
      memberId: query.memberId,
    };
    const cursor = query.cursor ? (JSON.parse(query.cursor) as ProjectListCursor) : null;
    if (cursor && (!cursor.at || !cursor.id)) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Invalid cursor');
    }
    const rows = await this.repo.findPage(filter, cursor, query.limit);
    const page = rows.slice(0, query.limit);
    const participants = await this.participantsRepo.rowsOfProjects(page.map((row) => row.id));
    const items = await this.mapper.toListItems(
      page.map((row) => ({
        row,
        participants: participants.filter((p) => p.projectId === row.id),
        viewer: user,
      })),
    );
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > query.limit && last
        ? JSON.stringify({ at: last.updatedAt.toISOString(), id: last.id })
        : null;
    return { items, nextCursor };
  }

  async detail(user: AuthUser, id: string): Promise<ProjectDetail> {
    const row = await this.assertVisible(user, id);
    return this.detailOf(user, row);
  }

  /** Карточка по уже проверенной строке (create/update возвращают detail). */
  async detailOf(user: AuthUser, row: { id: string }): Promise<ProjectDetail> {
    const fresh = await this.repo.findById(row.id);
    if (!fresh) throw DomainException.notFound('Project not found');
    const participants = await this.participantsRepo.rowsOfProject(row.id);
    return this.mapper.toDetail({ row: fresh, participants, viewer: user });
  }

  /** Видимость карточки: секретный — участие или view_secret (404 без оракула). */
  private async assertVisible(user: AuthUser, id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw DomainException.notFound('Project not found');
    if (row.visibility === 'secret') {
      const mine = await this.participantsRepo.hasRow(id, user.id);
      if (!mine && !user.permissions.includes(Permission.PROJECT_VIEW_SECRET)) {
        throw DomainException.notFound('Project not found');
      }
    }
    return row;
  }
}
