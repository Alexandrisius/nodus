import type { Redis } from 'ioredis';

/** Обработчик записи стрима (тот же, что у живого чтения: эмит + XACK). */
export type StreamEntryHandler = (id: string, fields: string[]) => Promise<void>;

export interface StreamRecoveryOptions {
  stream: string;
  group: string;
  /** Имя ТЕКУЩЕГО consumer'а: ему переходят чужие зависшие записи; себя GC не удаляет. */
  consumer: string;
  /** Запись считается брошенной, если не ACK-нута дольше (мс). */
  minIdleMs: number;
  /** Consumer без pending и без попыток чтения дольше (мс) — сирота, удаляется. */
  orphanIdleMs: number;
  /** Размер страницы XAUTOCLAIM. */
  batch: number;
}

/** Потолок страниц XAUTOCLAIM за один проход (страховка от бесконечного курсора). */
const MAX_RECLAIM_PAGES = 50;

type AutoclaimReply = [string, ([string, string[]] | null)[], string[]?];

/**
 * Перехват брошенных pending-записей группы (XAUTOCLAIM, Redis ≥ 6.2):
 * запись, выданная XREADGROUP-ом, но не ACK-нутая дольше `minIdleMs`
 * (падение/рестарт между чтением и XACK; consumer-имя с pid — после
 * рестарта pending мёртвого consumer'а не принадлежит никому), переходит
 * текущему consumer'у и обрабатывается штатным обработчиком (эмит + XACK).
 * Свои зависшие записи (сбой XACK) тоже перехватываются — XAUTOCLAIM не
 * различает владельца. Курсор — SCAN-подобный, `0-0` = PEL пройден.
 * Записи, вычищенные из стрима MAXLEN-ом, Redis 7+ сам убирает из PEL и
 * возвращает третьим элементом ответа (в 6.2 — null на месте записи) — их
 * обрабатывать нечем, пропускаем. Возвращает число обработанных записей.
 */
export async function reclaimIdlePending(
  redis: Redis,
  options: StreamRecoveryOptions,
  handle: StreamEntryHandler,
): Promise<number> {
  let cursor = '0-0';
  let handled = 0;
  for (let page = 0; page < MAX_RECLAIM_PAGES; page++) {
    const reply = (await redis.xautoclaim(
      options.stream,
      options.group,
      options.consumer,
      options.minIdleMs,
      cursor,
      'COUNT',
      options.batch,
    )) as AutoclaimReply;
    for (const entry of reply[1] ?? []) {
      if (!entry) continue;
      await handle(entry[0], entry[1]);
      handled++;
    }
    cursor = reply[0];
    if (cursor === '0-0') break;
  }
  return handled;
}

interface ConsumerInfo {
  name: string;
  pending: number;
  idle: number;
}

/** XINFO CONSUMERS (RESP2) — массив плоских пар [field, value, …] на consumer'а. */
function parseConsumers(raw: unknown): ConsumerInfo[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ConsumerInfo[] => {
    if (!Array.isArray(item)) return [];
    const fields = new Map<string, unknown>();
    for (let i = 0; i + 1 < item.length; i += 2) fields.set(String(item[i]), item[i + 1]);
    const name = fields.get('name');
    if (typeof name !== 'string') return [];
    return [{ name, pending: Number(fields.get('pending')), idle: Number(fields.get('idle')) }];
  });
}

/**
 * GC consumer'ов-сирот группы: удаляется (XGROUP DELCONSUMER) только чужой
 * consumer с pending = 0 и idle > `orphanIdleMs`. idle в Redis ≥ 7.2 — время
 * с последней ПОПЫТКИ чтения: живой reader с XREADGROUP BLOCK обновляет его
 * каждые несколько секунд, поэтому живой (включая опасного «второго
 * consumer'а» из gotcha #108 — его GC не лечит, это детект pre-flight-ом)
 * под порог не попадает; а удалённый живой consumer просто пересоздаётся
 * следующим XREADGROUP. pending > 0 не трогаем: DELCONSUMER выбросил бы
 * записи из PEL — их сначала перехватывает `reclaimIdlePending`, сирота
 * удаляется следующим проходом. Возвращает имена удалённых.
 */
export async function pruneOrphanConsumers(
  redis: Redis,
  options: StreamRecoveryOptions,
  warn: (message: string) => void = console.warn,
): Promise<string[]> {
  const consumers = parseConsumers(await redis.xinfo('CONSUMERS', options.stream, options.group));
  const removed: string[] = [];
  for (const info of consumers) {
    if (info.name === options.consumer) continue;
    if (info.pending !== 0 || !(info.idle > options.orphanIdleMs)) continue;
    // Гонка XINFO → DELCONSUMER: сирота мог успеть прочитать записи — ответ
    // DELCONSUMER = число выброшенных из PEL, громко сигналим (не должно быть).
    const dropped = Number(
      await redis.xgroup('DELCONSUMER', options.stream, options.group, info.name),
    );
    if (dropped > 0) {
      warn(`[gateway] orphan consumer ${info.name} deleted with ${dropped} pending entries`);
    }
    removed.push(info.name);
  }
  return removed;
}
