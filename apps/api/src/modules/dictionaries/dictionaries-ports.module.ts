import { Module } from '@nestjs/common';

import { DictionariesRepository } from './dictionaries.repository.js';
import { DictionaryReaderProvider } from './ports/dictionary-reader.provider.js';
import { DICTIONARY_READER } from './ports/dictionary-reader.port.js';

/**
 * Порты чтения справочников (ADR-0012): тонкий модуль экспорта read-портов
 * чужим модулям-потребителям (первый — custom-fields: подписи вариантов и
 * валют в DTO определений и значений). Единственная допустимая форма
 * межмодульного импорта; сервисы и репозиторий наружу не экспортируются.
 */
@Module({
  providers: [
    DictionariesRepository,
    DictionaryReaderProvider,
    { provide: DICTIONARY_READER, useExisting: DictionaryReaderProvider },
  ],
  exports: [DICTIONARY_READER],
})
export class DictionariesPortsModule {}
