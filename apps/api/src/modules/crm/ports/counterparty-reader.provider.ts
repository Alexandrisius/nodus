import { Injectable } from '@nestjs/common';
import type { CounterpartyRef } from '@nodus/contracts';

import { CounterpartiesRepository } from '../counterparties/counterparties.repository.js';
import type { CounterpartyReader } from './counterparty-reader.port.js';

/**
 * Реализация read-порта контрагентов (ADR-0012): наружу — только интерфейс,
 * таблицы crm читаются через собственный репозиторий модуля. `name` ссылки —
 * краткое (витринное) название, как в остальных ref-контрактах.
 */
@Injectable()
export class CounterpartyReaderProvider implements CounterpartyReader {
  constructor(private readonly counterparties: CounterpartiesRepository) {}

  async refs(ids: readonly string[]): Promise<CounterpartyRef[]> {
    if (ids.length === 0) return [];
    const rows = await this.counterparties.findRefs(ids);
    return rows.map((row) => ({ id: row.id, name: row.shortName }));
  }

  async activeRef(id: string): Promise<CounterpartyRef | null> {
    const row = await this.counterparties.findActiveRef(id);
    return row ? { id: row.id, name: row.shortName } : null;
  }
}
