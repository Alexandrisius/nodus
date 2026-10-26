import { Injectable } from '@nestjs/common';
import { ErrorCode, normalizeTypeConfig } from '@nodus/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { companyYear } from '../../../core/time/company-time.js';

/** Выданный номер: серия, год, порядковый номер и печатная строка. */
export interface AssignedNumber {
  seriesId: string;
  year: number;
  seq: number;
  /** «Вх-2026/118» — то, что видит человек и журнал перехода. */
  display: string;
  assignedAt: Date;
}

/**
 * Серии номеров «Процессов» (#55, Р2/O1): регистрационный номер письма
 * выдаётся в транзакции перехода (`assign_number`), поэтому откат перехода
 * не сдвигает счётчик — номеров без пропусков.
 *
 * Счётчик — строка `(series_id, year)`; upsert с `last_value + 1` сериализует
 * параллельные регистрации серии (30/день — норма, очередь на строке
 * незаметна). Год — по поясу компании (`COMPANY_TIMEZONE`), не по UTC:
 * письмо, зарегистрированное 1 января в 02:30 по Минску, получает новый год.
 */
@Injectable()
export class NumberSeriesService {
  /**
   * Следующий номер типа процесса: серия берётся из `config.numbering`.
   * Нет серии у типа — 409 `WORKFLOW_NUMBERING_NOT_CONFIGURED` (маршрут с
   * `assign_number` без нумерации — ошибка конфигурации, а не письма).
   */
  async nextForType(
    tx: TransactionClient,
    typeId: string,
    at = new Date(),
  ): Promise<AssignedNumber> {
    const type = await tx.processType.findUnique({
      where: { id: typeId },
      select: { config: true },
    });
    const seriesId = normalizeTypeConfig(type?.config).numbering?.seriesId;
    if (!seriesId) {
      throw new DomainException(
        ErrorCode.WORKFLOW_NUMBERING_NOT_CONFIGURED,
        'Process type has no number series',
        { typeId },
      );
    }
    return this.next(tx, seriesId, at);
  }

  /** Следующий номер серии; серия обязана существовать (каталог её сеет). */
  async next(tx: TransactionClient, seriesId: string, at = new Date()): Promise<AssignedNumber> {
    const series = await tx.numberSeries.findUnique({
      where: { id: seriesId },
      select: { id: true, prefix: true },
    });
    if (!series) {
      throw new DomainException(
        ErrorCode.WORKFLOW_NUMBERING_NOT_CONFIGURED,
        'Number series not found',
        { seriesId },
      );
    }
    const year = companyYear(at);
    const rows = await tx.$queryRaw<{ last_value: number }[]>(Prisma.sql`
      INSERT INTO "number_counters" ("series_id", "year", "last_value")
      VALUES (${seriesId}::uuid, ${year}, 1)
      ON CONFLICT ("series_id", "year")
        DO UPDATE SET "last_value" = "number_counters"."last_value" + 1
      RETURNING "last_value"
    `);
    const seq = rows[0]!.last_value;
    return {
      seriesId: series.id,
      year,
      seq,
      display: `${series.prefix}-${year}/${seq}`,
      assignedAt: at,
    };
  }
}
