import { Module } from '@nestjs/common';

import { DictionariesController } from './dictionaries.controller.js';
import { DictionariesRepository } from './dictionaries.repository.js';
import { DictionariesService } from './dictionaries.service.js';

/**
 * Модуль dictionaries (ядро, без feature flag): бизнес-списки как данные
 * (I15). Провайдеры не экспортируются — модули-потребители хранят UUID
 * элемента и читают справочник через REST/контракты (I3/I6).
 */
@Module({
  controllers: [DictionariesController],
  providers: [DictionariesService, DictionariesRepository],
})
export class DictionariesModule {}
