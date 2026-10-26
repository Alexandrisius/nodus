import { Module } from '@nestjs/common';

import { LettersRepository } from './letters/letters.repository.js';
import { LetterChatReaderProvider } from './ports/letter-chat-reader.provider.js';
import { LETTER_CHAT_READER } from './ports/letter-chat-reader.port.js';

/**
 * Порты корреспонденции для чужих модулей (ADR-0012, #55): мост чата
 * (`LETTER_CHAT_READER`) читает состав беседы и видимость письма, не трогая
 * таблицы `letters`. Единственная допустимая форма межмодульного импорта;
 * доменные сервисы наружу не экспортируются.
 */
@Module({
  providers: [
    LettersRepository,
    LetterChatReaderProvider,
    { provide: LETTER_CHAT_READER, useExisting: LetterChatReaderProvider },
  ],
  exports: [LETTER_CHAT_READER],
})
export class CorrespondencePortsModule {}
