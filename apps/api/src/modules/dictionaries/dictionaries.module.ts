import { Module } from '@nestjs/common';

import { DictionariesController } from './dictionaries.controller.js';
import { DictionariesRepository } from './dictionaries.repository.js';
import { DictionariesService } from './dictionaries.service.js';
import { DictionaryItemsService } from './dictionary-items.service.js';

/**
 * Модуль dictionaries (ядро, без feature flag): бизнес-списки как данные
 * (I15). Чтение — всем; запись — правом `dictionary.manage` (#431, Р10:
 * без неё тип «Список» мёртв). Провайдеры наружу не экспортируются —
 * потребители читают через `DictionariesPortsModule` (ADR-0012).
 */
@Module({
  controllers: [DictionariesController],
  providers: [DictionariesService, DictionaryItemsService, DictionariesRepository],
})
export class DictionariesModule {}
