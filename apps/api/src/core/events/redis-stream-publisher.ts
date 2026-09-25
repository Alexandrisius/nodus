import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Redis } from 'ioredis';
import { Prisma } from '../../generated/prisma/client.js';
import { CHAT_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/** Период опроса outbox: бюджет p95 доставки <200 мс (НФТ #104). */
const POLL_INTERVAL_MS = 100;
/** Страница чтения: 500 сообщ/мин пик — с запасом на пачки правок/прочтений. */
const BATCH_LIMIT = 200;
/** Хвост стрима: история в стриме не нужна (клиент ресинхронизируется рефечем). */
const STREAM_MAXLEN = 100_000;

/**
 * Ключ чекпоинта скоупится именем БД: dev- и тестовые контуры делят один
 * Redis (ADR-0002), а seq в разных БД несравнимы — общий ключ заставил бы
 * контуры перезаписывать точку друг друга (и flood-ом публиковать историю).
 */
export function fanoutCheckpointKey(databaseUrl: string | undefined): string {
  let database = 'nodus';
  try {
    const path = new URL(databaseUrl ?? '').pathname;
    const parsed = path.split('/').filter(Boolean).pop();
    if (parsed) {
      database = parsed;
    }
  } catch {
    // невалидный/отсутствующий URL — дефолт
  }
  return `nodus:chat:fanout:seq:${database}`;
}

interface PendingEventRow {
  seq: bigint;
  type: string;
  payload: unknown;
  createdAt: Date;
}

/**
 * Издатель realtime-фанута (#104): читает outbox `events` по монотонному
 * `seq` и публикует доменные события `chat.*` в Redis Stream
 * `nodus:chat:events` (consumer — WS-gateway). Это отдельный лёгкий поллер,
 * а не EventDispatcher: тот доставляет события внутрибоксовым обработчикам
 * (1 с), здесь бюджет — <200 мс до браузера.
 *
 * Гарантии: at-least-once (крэш между XADD и чекпоинтом → повторная
 * публикация части батча); порядок — по seq, но поздняя фиксация транзакции
 * может дать событию меньший seq после большего — безопасно, клиент
 * применяет события ТОЛЬКО как сигнал к рефечу, состояние не применяется.
 * Bootstrap без чекпоинта: старт с max(seq) — историю в стрим не льём.
 */
@Injectable()
export class RedisStreamPublisher implements OnModuleInit, OnModuleDestroy {
  private checkpoint: bigint | null = null;
  private timer: NodeJS.Timeout | null = null;
  private publishing = false;
  private readonly checkpointKey: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisStreamPublisher.name);
    this.checkpointKey = fanoutCheckpointKey(process.env.DATABASE_URL);
  }

  async onModuleInit(): Promise<void> {
    const stored = await this.redis.get(this.checkpointKey);
    if (stored !== null) {
      this.checkpoint = BigInt(stored);
    } else {
      const [row] = await this.prisma.$queryRaw<{ max: bigint | null }[]>(
        Prisma.sql`SELECT max(seq) AS max FROM events`,
      );
      this.checkpoint = row?.max ?? 0n;
      await this.redis.set(this.checkpointKey, this.checkpoint.toString());
      this.logger.info({ checkpoint: this.checkpoint.toString() }, 'fanout bootstrap at max(seq)');
    }
    this.timer = setInterval(() => {
      void this.publishPending();
    }, POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Один проход публикации (также используется интеграционными тестами). */
  async publishPending(): Promise<void> {
    if (this.publishing || this.checkpoint === null) {
      return; // защита от наложения опросов / до завершения bootstrap
    }
    this.publishing = true;
    try {
      const rows = await this.prisma.$queryRaw<PendingEventRow[]>(
        Prisma.sql`SELECT seq, type, payload, created_at AS "createdAt"
                   FROM events
                   WHERE seq > ${this.checkpoint} AND type LIKE 'chat.%'
                   ORDER BY seq ASC
                   LIMIT ${BATCH_LIMIT}`,
      );
      if (rows.length === 0) {
        return;
      }
      const pipeline = this.redis.multi();
      for (const row of rows) {
        const envelope: RealtimeEnvelope = {
          type: row.type,
          payload: row.payload,
          seq: Number(row.seq),
          ts: row.createdAt.toISOString(),
        };
        pipeline.xadd(
          CHAT_EVENTS_STREAM,
          'MAXLEN',
          '~',
          STREAM_MAXLEN,
          '*',
          'envelope',
          JSON.stringify(envelope),
        );
      }
      const results = await pipeline.exec();
      const failed = results?.findIndex(([err]) => err !== null) ?? -1;
      if (failed >= 0) {
        // Чекпоинт не двигаем: батч повторится целиком (дубликаты отстреляют
        // в gateway как лишние инвалидации — безвредно).
        throw results![failed]![0];
      }
      this.checkpoint = rows[rows.length - 1]!.seq;
      await this.redis.set(this.checkpointKey, this.checkpoint.toString());
    } catch (error) {
      this.logger.error({ err: error }, 'chat fanout publish failed, will retry');
    } finally {
      this.publishing = false;
    }
  }
}
