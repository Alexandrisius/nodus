import { Module } from '@nestjs/common';

import { USER_PROFILE_READER } from '../../core/ports/user-profile.port.js';
import { UserProfileProvider } from '../../core/ports/user-profile.provider.js';
import { ConversationItemMapper } from './conversations/conversation-item.mapper.js';
import { ConversationsController } from './conversations/conversations.controller.js';
import { ConversationsRepository } from './conversations/conversations.repository.js';
import { ConversationsService } from './conversations/conversations.service.js';
import { AttachmentsController } from './messages/attachments.controller.js';
import { AttachmentsRepository } from './messages/attachments.repository.js';
import { AttachmentsService } from './messages/attachments.service.js';
import { MessageActionsController } from './messages/message-actions.controller.js';
import { MessageActionsService } from './messages/message-actions.service.js';
import { MessageDtoMapper } from './messages/message-dto.mapper.js';
import { MessagePinsRepository } from './messages/message-pins.repository.js';
import { MessagesController } from './messages/messages.controller.js';
import { MessagesRepository } from './messages/messages.repository.js';
import { MessagesService } from './messages/messages.service.js';
import { ThreadParticipantsRepository } from './messages/thread-participants.repository.js';

/**
 * Модуль chat (M6, #58): беседы (direct/group/каналы), сообщения, треды,
 * реакции, закрепы, прочитанность, пересылка, вложения (#57: загрузка через
 * порт FILE_STORAGE модуля files, отдача по подписанным ссылкам). Изоляция (I3/I6): таблицы
 * чата — только через репозитории модуля; профили сотрудников — read-порт
 * USER_PROFILE_READER (ADR-0012; users — core-shared таблица, реализация в
 * core/ports). Модуль за
 * фичефлагом `chat` (I10) — гварды на контроллерах.
 */
@Module({
  // Вложения (#57): порт FILE_STORAGE — @Global FilesModule (как CryptoModule),
  // без межмодульного импорта (I3/I6); здесь chat знает только интерфейс.
  controllers: [
    ConversationsController,
    MessagesController,
    MessageActionsController,
    AttachmentsController,
  ],
  providers: [
    ConversationsRepository,
    ConversationsService,
    ConversationItemMapper,
    MessagesRepository,
    ThreadParticipantsRepository,
    MessagesService,
    MessageActionsService,
    MessagePinsRepository,
    AttachmentsRepository,
    AttachmentsService,
    MessageDtoMapper,
    UserProfileProvider,
    { provide: USER_PROFILE_READER, useClass: UserProfileProvider },
  ],
})
export class ChatModule {}
