import { Global, Module } from '@nestjs/common';

import { FILE_ACCESS_CONTRIBUTORS } from '../../../core/ports/file-access.port.js';
import { ChatFileAccess } from './chat-file-access.provider.js';
import { ChatFileAccessRepository } from './chat-file-access.repository.js';

/**
 * @Global-мост прав chat → files (#138, I3/I6): регистрирует контрибьютора в
 * токене-массиве FILE_ACCESS_CONTRIBUTORS без межмодульного импорта (паттерн
 * USER_PROFILE_READER / FILE_STORAGE; в Nest нет Angular-multi — токен
 * провайдится фабрикой-массивом). Самодостаточен (свой репозиторий на
 * PrismaService из @Global DatabaseModule) — провайдеров ChatModule не тянет.
 */
@Global()
@Module({
  providers: [
    ChatFileAccessRepository,
    ChatFileAccess,
    {
      provide: FILE_ACCESS_CONTRIBUTORS,
      useFactory: (chat: ChatFileAccess) => [chat],
      inject: [ChatFileAccess],
    },
  ],
})
export class ChatFileAccessModule {}
