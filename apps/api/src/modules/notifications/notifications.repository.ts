import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  ListNotificationsQuery,
  Notification,
  NotificationDelivery,
  NotificationFilter,
  NotificationSettings,
} from '@nodus/contracts';

import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';
import { USER_PROFILE_READER, type UserProfileReader } from '../../core/ports/user-profile.port.js';
import type { UserRef } from '@nodus/contracts';

interface NotificationRow {
  id: string;
  seq: bigint;
  user_id: string;
  priority: string;
  kind: string;
  source_type: string;
  source_id: string;
  source_seq: bigint;
  actor_id: string | null;
  preview: string | null;
  urgent_text: string | null;
  conversation_id: string | null;
  conversation_title: string | null;
  message_id: string | null;
  thread_root_id: string | null;
  created_at: Date;
  read_at: Date | null;
  ack_at: Date | null;
  repeats_stopped_at: Date | null;
}

/** Вход создания журнала (id/uuid генерирует сервис; seq/времена — БД). */
export type NotificationInsert = Omit<
  NotificationRow,
  'seq' | 'created_at' | 'read_at' | 'ack_at' | 'repeats_stopped_at'
> & { event_id: string };

/** Превью строки ленты: обрезаем текст сообщения на границе слова. */
export const PREVIEW_MAX = 160;

// >300 строк — обоснование (I5): единая точка SQL журнала (список/сводка/гашения/
// стопы/ознакомления/доставки/настройки) — расщепление по таблицам разорвёт
// инварианты гашения (read_at vs repeats_stopped_at) по файлам без выигрыша.

const NOTIFICATION_COLS = Prisma.sql`
  id, seq, user_id AS "user_id", priority, kind,
  source_type AS "source_type", source_id AS "source_id", source_seq AS "source_seq",
  actor_id AS "actor_id", preview, urgent_text AS "urgent_text",
  conversation_id AS "conversation_id", conversation_title AS "conversation_title",
  message_id AS "message_id", thread_root_id AS "thread_root_id",
  created_at AS "created_at", read_at AS "read_at", ack_at AS "ack_at",
  repeats_stopped_at AS "repeats_stopped_at"
`;

function filterWhere(userId: string, filter: NotificationFilter): Prisma.Sql {
  const base = Prisma.sql`user_id = ${userId}::uuid`;
  switch (filter) {
    case 'attention':
      return Prisma.sql`${base} AND read_at IS NULL AND priority <> 'low'`;
    case 'unread':
      return Prisma.sql`${base} AND read_at IS NULL`;
    case 'mentions':
      return Prisma.sql`${base} AND read_at IS NULL AND kind = 'chat.mention'`;
    case 'low':
      return Prisma.sql`${base} AND read_at IS NULL AND priority = 'low'`;
    case 'all':
    default:
      return base;
  }
}

/**
 * Единственная точка доступа модуля к таблицам журнала (patterns.md):
 * notifications + notification_deliveries. Гидратация actor — read-порт
 * профиля (ADR-0012). Сортировка детерминирована: seq DESC (id — тайбрейк
 * не нужен: seq unique).
 */
@Injectable()
export class NotificationsRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
  ) {}

  /** Страница журнала (filter + поиск + дельта afterSeq; курсор по seq). */
  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ rows: NotificationRow[]; hasMore: boolean }> {
    const conditions = [filterWhere(userId, query.filter)];
    if (query.afterSeq !== undefined) {
      conditions.push(Prisma.sql`seq > ${BigInt(query.afterSeq)}::bigint`);
    }
    if (query.q !== undefined && query.q.length > 0) {
      conditions.push(Prisma.sql`preview ILIKE ${'%' + query.q + '%'}`);
    }
    if (query.cursor !== undefined) {
      conditions.push(Prisma.sql`seq < ${BigInt(query.cursor)}::bigint`);
    }
    const rows = await this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
      SELECT ${NOTIFICATION_COLS} FROM notifications
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY seq DESC
      LIMIT ${query.limit + 1}
    `);
    return { rows: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
  }

  /** Сводка «число + точка» (индикация; G4-деградация — пустая сводка). */
  async summary(userId: string): Promise<{
    urgent: number;
    high: number;
    medium: number;
    low: number;
  }> {
    const rows = await this.prisma.$queryRaw<{ priority: string; count: bigint }[]>(Prisma.sql`
      SELECT priority, count(*) AS count FROM notifications
      WHERE user_id = ${userId}::uuid AND read_at IS NULL
      GROUP BY priority
    `);
    const byPriority = new Map(rows.map((r) => [r.priority, Number(r.count)]));
    return {
      urgent: byPriority.get('urgent') ?? 0,
      high: byPriority.get('high') ?? 0,
      medium: byPriority.get('medium') ?? 0,
      low: byPriority.get('low') ?? 0,
    };
  }

  /** Создание журнала из события: дедуп (event_id, user_id) — уникальный
   *  индекс; возвращает ТОЛЬКО созданные строки (повтор события — пусто). */
  async createFromEvent(
    rows: NotificationInsert[],
    tx?: TransactionClient,
  ): Promise<NotificationRow[]> {
    if (rows.length === 0) return [];
    const client = tx ?? this.prisma;
    const values = rows.map(
      (r) => Prisma.sql`(
        ${r.id}::uuid, ${r.user_id}::uuid, ${r.priority}, ${r.kind},
        ${r.source_type}, ${r.source_id}::uuid, ${r.source_seq}::bigint,
        ${r.actor_id}::uuid, ${r.preview}, ${r.urgent_text},
        ${r.conversation_id}::uuid, ${r.conversation_title}, ${r.message_id}::uuid,
        ${r.thread_root_id}::uuid, ${r.event_id}::uuid
      )`,
    );
    return client.$queryRaw<NotificationRow[]>(Prisma.sql`
      INSERT INTO notifications (
        id, user_id, priority, kind, source_type, source_id, source_seq,
        actor_id, preview, urgent_text, conversation_id, conversation_title,
        message_id, thread_root_id, event_id
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT (event_id, user_id) DO NOTHING
      RETURNING ${NOTIFICATION_COLS}
    `);
  }

  /** Своё уведомление по id (RBAC: чужое = не найдено, G3). */
  async findById(userId: string, id: string): Promise<NotificationRow | null> {
    const rows = await this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
      SELECT ${NOTIFICATION_COLS} FROM notifications
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    `);
    return rows[0] ?? null;
  }

  /** Прочитать одно (E3: клик по строке = автопрочтение по правилам яруса):
   *  любое кроме срочного (оно — только через ознакомление). */
  async readOne(
    userId: string,
    id: string,
    tx?: TransactionClient,
  ): Promise<NotificationRow | null> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<NotificationRow[]>(Prisma.sql`
      UPDATE notifications SET read_at = now()
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        AND read_at IS NULL AND priority <> 'urgent'
      RETURNING ${NOTIFICATION_COLS}
    `);
    return rows[0] ?? this.findById(userId, id);
  }

  /** Гашение по источнику (вход в чат): high/medium/low до watermark;
   *  срочному — стоп повторов (прочитано, C2), висит до ознакомления. */
  async markReadBySource(
    userId: string,
    sourceId: string,
    upToSeq: number,
    tx?: TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.$executeRaw(Prisma.sql`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${userId}::uuid AND source_id = ${sourceId}::uuid
        AND source_seq <= ${BigInt(upToSeq)}::bigint AND read_at IS NULL
        AND priority <> 'urgent'
    `);
  }

  /** Стоп повторов срочного (прочтение/ответ/реакция/ознакомление, C2/C3). */
  async stopRepeats(
    userId: string,
    where: { messageId?: string; conversationId?: string },
    tx?: TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const scope =
      where.messageId !== undefined
        ? Prisma.sql`message_id = ${where.messageId}::uuid`
        : Prisma.sql`source_id = ${where.conversationId}::uuid`;
    return client.$executeRaw(Prisma.sql`
      UPDATE notifications SET repeats_stopped_at = now()
      WHERE user_id = ${userId}::uuid AND priority = 'urgent' AND ${scope}
        AND ack_at IS NULL AND repeats_stopped_at IS NULL
    `);
  }

  /** Автор срочного сообщения (actor строк журнала) — адресат будила acked. */
  async urgentAuthorId(messageId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ actor_id: string }[]>(Prisma.sql`
      SELECT actor_id FROM notifications
      WHERE message_id = ${messageId}::uuid AND priority = 'urgent'
      LIMIT 1
    `);
    return rows[0]?.actor_id ?? null;
  }

  /** Настройки пользователя (одна строка; null — дефолты). */
  async readSettings(userId: string): Promise<NotificationSettings | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ dnd_enabled: boolean; dnd_start: string; dnd_end: string }>
    >(Prisma.sql`
      SELECT dnd_enabled, dnd_start, dnd_end FROM notification_settings
      WHERE user_id = ${userId}::uuid
    `);
    const row = rows[0];
    if (!row) return null;
    return { dndEnabled: row.dnd_enabled, dndStart: row.dnd_start, dndEnd: row.dnd_end };
  }

  /** Upsert настроек (частичный патч поверх существующих/дефолтов). */
  async upsertSettings(
    userId: string,
    patch: Partial<NotificationSettings>,
  ): Promise<NotificationSettings> {
    const current = (await this.readSettings(userId)) ?? {
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
    };
    const next = { ...current, ...patch };
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO notification_settings (user_id, dnd_enabled, dnd_start, dnd_end)
      VALUES (${userId}::uuid, ${next.dndEnabled}, ${next.dndStart}, ${next.dndEnd})
      ON CONFLICT (user_id) DO UPDATE SET
        dnd_enabled = ${next.dndEnabled}, dnd_start = ${next.dndStart}, dnd_end = ${next.dndEnd}
    `);
    return next;
  }

  /** Ознакомление (только срочное, только своё): идемпотентно — повторный
   *  ack возвращает уже-ознакомленную строку без новой записи. */
  async ack(userId: string, id: string): Promise<NotificationRow | null> {
    const rows = await this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
      UPDATE notifications SET ack_at = now(), repeats_stopped_at = now(), read_at = now()
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND priority = 'urgent' AND ack_at IS NULL
      RETURNING ${NOTIFICATION_COLS}
    `);
    return rows[0] ?? this.findById(userId, id);
  }

  /** «Ознакомились N из M» по срочному сообщению (отправитель, C8/C9). */
  async urgentAcks(messageId: string): Promise<{
    rows: Array<{ userId: string; ackedAt: Date }>;
    expected: number;
  }> {
    const rows = await this.prisma.$queryRaw<{ user_id: string; ack_at: Date }[]>(Prisma.sql`
      SELECT user_id, ack_at FROM notifications
      WHERE message_id = ${messageId}::uuid AND priority = 'urgent' AND ack_at IS NOT NULL
      ORDER BY ack_at ASC
    `);
    const total = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*) AS count FROM notifications
      WHERE message_id = ${messageId}::uuid AND priority = 'urgent'
    `);
    return {
      rows: rows.map((r) => ({ userId: r.user_id, ackedAt: r.ack_at })),
      expected: Number(total[0]?.count ?? 0),
    };
  }

  /** Запись доставки по каналу (журнал доставок, C11/D6). */
  async recordDelivery(
    notificationId: string,
    channel: 'ws' | 'repeat',
    attempt: number,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.$executeRaw(Prisma.sql`
      INSERT INTO notification_deliveries (id, notification_id, channel, attempt)
      VALUES (gen_random_uuid(), ${notificationId}::uuid, ${channel}, ${attempt})
    `);
  }

  /** Журнал доставок уведомления (D6: когда и каким каналом). */
  async deliveries(notificationId: string): Promise<NotificationDelivery[]> {
    const rows = await this.prisma.$queryRaw<
      {
        channel: string;
        attempt: number;
        delivered_at: Date;
      }[]
    >(Prisma.sql`
      SELECT channel, attempt, delivered_at FROM notification_deliveries
      WHERE notification_id = ${notificationId}::uuid
      ORDER BY delivered_at ASC
    `);
    return rows.map((r) => ({
      channel: r.channel as NotificationDelivery['channel'],
      attempt: r.attempt,
      deliveredAt: r.delivered_at.toISOString(),
    }));
  }

  /** Авто-архивация низкого (анти-свалка): старше 7 дней — read, журнал жив. */
  async archiveStaleLow(olderThanDays: number): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE notifications SET read_at = now()
      WHERE priority = 'low' AND read_at IS NULL
        AND created_at < now() - (${olderThanDays} || ' days')::interval
    `);
  }

  /** DTO строки журнала: гидратация actor батчем (ADR-0012). */
  async toDtos(rows: NotificationRow[]): Promise<Notification[]> {
    const actorIds = [...new Set(rows.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
    const refs = new Map<string, UserRef>();
    for (const ref of await this.userProfiles.findRefs(actorIds)) refs.set(ref.id, ref);
    return rows.map((row) => ({
      id: row.id,
      seq: Number(row.seq),
      priority: row.priority as Notification['priority'],
      kind: row.kind as Notification['kind'],
      sourceType: row.source_type as Notification['sourceType'],
      sourceId: row.source_id,
      actor: row.actor_id ? (refs.get(row.actor_id) ?? null) : null,
      preview: row.preview,
      urgentText: row.urgent_text,
      conversationId: row.conversation_id,
      conversationTitle: row.conversation_title,
      messageId: row.message_id,
      threadRootId: row.thread_root_id,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at?.toISOString() ?? null,
      ackAt: row.ack_at?.toISOString() ?? null,
    }));
  }

  /** Строка для повтора/воркера (сырая). */
  async findRaw(id: string): Promise<NotificationRow | null> {
    const rows = await this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
      SELECT ${NOTIFICATION_COLS} FROM notifications WHERE id = ${id}::uuid
    `);
    return rows[0] ?? null;
  }

  /** Потолок повторов: пометить стоп (C4). */
  async markRepeatsStopped(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.$executeRaw(Prisma.sql`
      UPDATE notifications SET repeats_stopped_at = now()
      WHERE id = ${id}::uuid AND repeats_stopped_at IS NULL
    `);
  }
}
