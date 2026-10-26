import { Inject, Injectable } from '@nestjs/common';
import {
  Permission,
  type AuthUser,
  type LetterDetail,
  type LetterListItem,
  type ListLettersQuery,
  type Paginated,
  type UserRef,
} from '@nodus/contracts';
import { z } from 'zod';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import {
  ROLE_MEMBERSHIP_READER,
  type RoleMembershipReader,
} from '../../../core/ports/role-membership.port.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import {
  COUNTERPARTY_READER,
  type CounterpartyReader,
} from '../../crm/ports/counterparty-reader.port.js';
import { canRegisterLetters, canViewLetter, letterAccessOf } from '../access/letter-access.js';
import { LetterDtoMapper } from './letter-dto.mapper.js';
import type { LetterCursor, LetterDetailRow } from './letter-row.js';
import { LettersRepository, listOrderOf } from './letters.repository.js';

const cursorSchema = z.object({ at: z.string().min(1), id: z.uuid() });

/** Поиск по корреспонденту: сколько контрагентов подмешивать в OR (штат ~сотни). */
const SEARCH_COUNTERPARTIES = 50;

/**
 * Чтения писем (#55): «Новые», «Входящие», «Исходящие», карточка и адресаты
 * «Принимают решения». Видимость — одна функция `letter-access.ts` (Р7):
 * незарегистрированное письмо чужому — 404, `box=new` без права — 403.
 */
@Injectable()
export class LettersQueryService {
  constructor(
    private readonly repo: LettersRepository,
    private readonly mapper: LetterDtoMapper,
    @Inject(COUNTERPARTY_READER) private readonly counterparties: CounterpartyReader,
    @Inject(ROLE_MEMBERSHIP_READER) private readonly membership: RoleMembershipReader,
    @Inject(USER_PROFILE_READER) private readonly profiles: UserProfileReader,
  ) {}

  async list(user: AuthUser, q: ListLettersQuery): Promise<Paginated<LetterListItem>> {
    if (q.box === 'new' && !canRegisterLetters(user)) {
      throw DomainException.forbidden('Letter registration permission required');
    }
    const where = { AND: [this.boxWhere(q, user), ...(await this.searchWhere(q.search))] };
    const after = q.cursor ? (decodeCursor(q.cursor, cursorSchema) as LetterCursor) : undefined;
    const rows = await this.repo.list(where, listOrderOf(q.box), after, q.limit);
    const page = rows.slice(0, q.limit);
    const counts = await this.repo.attachmentCounts(page.map((row) => row.id));
    const last = page[page.length - 1];
    const axis = listOrderOf(q.box);
    return {
      items: await this.mapper.toListItems(page, counts),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ at: last[axis]!.toISOString(), id: last.id })
          : null,
    };
  }

  /** Карточка: видимость → права → DTO (ссылки и файлы только видимому). */
  async detail(user: AuthUser, id: string): Promise<LetterDetail> {
    const row = await this.visibleRow(user, id);
    const participants = await this.repo.participants(id);
    const isParticipant =
      participants.some((p) => p.userId === user.id) || row.addresseeId === user.id;
    const attachments = await this.repo.attachments(id);
    return this.mapper.toDetail(row, attachments, letterAccessOf(user, row, isParticipant));
  }

  /** Письмо, видимое сотруднику, или 404 (невидимое = «не найдено», Р7). */
  async visibleRow(user: AuthUser, id: string): Promise<LetterDetailRow> {
    const row = await this.repo.findDetailById(id);
    if (!row || !canViewLetter(user, row)) throw DomainException.notFound('Letter not found');
    return row;
  }

  /** «Принимают решения» (#55): активные держатели `correspondence.resolve`. */
  async resolvers(): Promise<UserRef[]> {
    const holders = await this.membership.holdersOf(Permission.CORRESPONDENCE_RESOLVE);
    if (holders.length === 0) return [];
    const refs = await this.profiles.findRefs(holders.map((holder) => holder.id));
    return refs
      .filter((ref) => holders.some((holder) => holder.id === ref.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
  }

  private boxWhere(q: ListLettersQuery, user: AuthUser) {
    const registered = { registeredAt: { not: null } };
    switch (q.box) {
      case 'new':
        return { registeredAt: null };
      case 'incoming':
        return { ...registered, direction: 'incoming' };
      case 'outgoing':
        return { ...registered, direction: 'outgoing' };
      default:
        // Без box — зарегистрированные обоих направлений (палитра, CRM);
        // невидимое незарегистрированное не подмешивается никому, кроме
        // канцелярии (иначе поиск раскрывал бы «Новые»).
        return canRegisterLetters(user) ? {} : registered;
    }
  }

  private async searchWhere(search: string | undefined) {
    if (!search) return [];
    const counterpartyIds = await this.counterparties.searchIds(search, SEARCH_COUNTERPARTIES);
    return [
      {
        OR: [
          { subject: { contains: search, mode: 'insensitive' as const } },
          { regNumber: { contains: search, mode: 'insensitive' as const } },
          { theirNumber: { contains: search, mode: 'insensitive' as const } },
          ...(counterpartyIds.length > 0 ? [{ counterpartyId: { in: counterpartyIds } }] : []),
        ],
      },
    ];
  }
}
