import { Module } from '@nestjs/common';

import { MembershipReaderProvider } from './membership-reader.provider.js';
import { CHAT_MEMBERSHIP_READER } from './membership-reader.port.js';

/**
 * Порты чтения чата (ADR-0012): тонкий модуль экспорта read-портов чужим
 * модулям-потребителям (notifications, #100) — единственная допустимая форма
 * межмодульного импорта; доменные сервисы/репозитории чата не экспортируются.
 */
@Module({
  providers: [
    MembershipReaderProvider,
    { provide: CHAT_MEMBERSHIP_READER, useClass: MembershipReaderProvider },
  ],
  exports: [CHAT_MEMBERSHIP_READER],
})
export class ChatPortsModule {}
