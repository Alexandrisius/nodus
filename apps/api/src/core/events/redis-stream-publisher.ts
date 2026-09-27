import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Redis } from 'ioredis';
import { Prisma } from '../../generated/prisma/client.js';
import { CHAT_EVENTS_STREAM, type RealtimeEnvelope } from '@nodus/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/** Период опроса outbox: бюджет p95 доставки <200 мс (НФТ #104); раунд 2 —
 * 50 мс (вдвое лучше бюджет доставки «commit → браузер», владелец видел
 * задержки; приборная правда была <200 мс, но запас не лишний). */
const POLL_INTERVAL_MS = 50;
/** Страница чтения: 500 сообщ/мин пик — с запасом на пачки правок/прочтений. */
const BATCH_LIMIT = 200;
/** Хвост стрима: история в стриме не нужна (клиент ресинхронизируется рефечем). */
const STREAM_MAXLEN = 100_000;

interface PendingEventRow {
  id: string;
  seq: bigint;
  type: string;
  payload: unknown;
  createdAt: Date;
}

/**
 * Издатель realtime-фанута (#104): читает хвост outbox `events` с доменными
 * событиями `chat.*` и публикует их в Redis Stream `nodus:chat:events`
 * (consumer — WS-gateway). Это отдельный лёгкий поллер, а не EventDispatcher:
 * тот доставляет события внутрибоксовым обработчикам (1 с), здесь бюджет —
 * <200 мс до браузера.
 *
 * Курсор — множество строк с `fanout_at IS NULL`, а НЕ `seq > checkpoint`:
 * seq выделяется последовательностью БД ВНУТРИ незакоммиченной транзакции,
 * поэтому событие, закоммиченное позже соседа с большим seq, seq-курсор
 * перепрыгивает навсегда («отправил, а не пришло» без следов в логах —
 * аудит #123). Метка `fanout_at` ставится ПОСЛЕ успешного XADD: поздно
 * закоммиченное событие подберётся следующим тиком, а нормальные идут с
 * бюджетом 50 мс. Порядок выдачи — по seq; инверсию порядка приёма клиент
 * ловит «дырой» seq и откатывается к рефечу (ws-apply).
 *
 * Гарантии: at-least-once (крэш между XADD и меткой → повторная публикация
 * батча; дубли для gateway безвредны). Bootstrap: история до max(seq)
 * помечается опубликованной разом — в стрим льётся только живой хвост;
 * закоммиченное «в щель» bootstrap-а событие метки не получает и доедет.
 */
@Injectable()
export class RedisStreamPublisher implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private publishing = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisStreamPublisher.name);
  }

  async onModuleInit(): Promise<void> {
    const marked = await this.prisma.$executeRaw(
      Prisma.sql`UPDATE events SET fanout_at = now()
                 WHERE fanout_at IS NULL AND seq <= (SELECT max(seq) FROM events)`,
    );
    this.logger.info({ marked }, 'fanout bootstrap: history marked published');
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
    if (this.publishing) {
      return; // защита от наложения опросов
    }
    this.publishing = true;
    try {
      const rows = await this.prisma.$queryRaw<PendingEventRow[]>(
        Prisma.sql`SELECT id, seq, type, payload, created_at AS "createdAt"
                   FROM events
                   WHERE fanout_at IS NULL AND type LIKE 'chat.%'
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
        // Метки не ставим: батч повторится целиком (дубликаты отстреляют
        // в gateway как лишние инвалидации — безвредно).
        throw results![failed]![0];
      }
      const ids = rows.map((row) => row.id);
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE events SET fanout_at = now()
                   WHERE id = ANY(${ids}::uuid[]) AND fanout_at IS NULL`,
      );
    } catch (error) {
      this.logger.error({ err: error }, 'chat fanout publish failed, will retry');
    } finally {
      this.publishing = false;
    }
  }
}
