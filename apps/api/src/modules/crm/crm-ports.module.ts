import { Module } from '@nestjs/common';

import { CounterpartiesRepository } from './counterparties/counterparties.repository.js';
import { CounterpartyReaderProvider } from './ports/counterparty-reader.provider.js';
import { COUNTERPARTY_READER } from './ports/counterparty-reader.port.js';

/**
 * Порты чтения CRM (ADR-0012): тонкий модуль экспорта read-портов чужим
 * модулям-потребителям (#55 — корреспондент и подписант письма, #52 —
 * заказчик проекта). Единственная допустимая форма межмодульного импорта;
 * доменные сервисы и репозитории наружу не экспортируются.
 */
@Module({
  providers: [
    CounterpartiesRepository,
    CounterpartyReaderProvider,
    { provide: COUNTERPARTY_READER, useExisting: CounterpartyReaderProvider },
  ],
  exports: [COUNTERPARTY_READER],
})
export class CrmPortsModule {}
