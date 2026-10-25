import { Module } from '@nestjs/common';

import { ContactsController } from './contacts/contacts.controller.js';
import { ContactsRepository } from './contacts/contacts.repository.js';
import { ContactsService } from './contacts/contacts.service.js';
import { CounterpartiesController } from './counterparties/counterparties.controller.js';
import { CounterpartiesQueryService } from './counterparties/counterparties-query.service.js';
import { CounterpartiesRepository } from './counterparties/counterparties.repository.js';
import { CounterpartiesService } from './counterparties/counterparties.service.js';

/**
 * Модуль crm (#460, ADR-0033): master-данные внешних организаций —
 * контрагенты и контактные лица. За фичефлагом `crm` (I10): выключенный
 * модуль отвечает 404 как несуществующий. Чужим модулям доступен только
 * read-порт `COUNTERPARTY_READER` (CrmPortsModule, ADR-0012) — доменные
 * сервисы и репозитории не экспортируются (I3/I6).
 */
@Module({
  controllers: [CounterpartiesController, ContactsController],
  providers: [
    CounterpartiesRepository,
    ContactsRepository,
    CounterpartiesQueryService,
    CounterpartiesService,
    ContactsService,
  ],
})
export class CrmModule {}
