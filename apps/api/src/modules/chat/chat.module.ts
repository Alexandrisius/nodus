import { Module } from '@nestjs/common';

import { USER_PROFILE_READER } from '../../core/ports/user-profile.port.js';
import { UserProfileProvider } from '../../core/ports/user-profile.provider.js';
import { ConversationItemMapper } from './conversations/conversation-item.mapper.js';
import { ConversationMembersController } from './conversations/conversation-members.controller.js';
import { ConversationMembersService } from './conversations/conversation-members.service.js';
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
import { ThumbnailQueue } from './messages/thumbnail.queue.js';
import { ThumbnailService } from './messages/thumbnail.service.js';
import { ThumbnailWorker } from './messages/thumbnail.worker.js';
import { UrgentPolicyController } from './messages/urgent-policy.controller.js';
import { UrgentPolicyReader } from './messages/urgent-policy.reader.js';
import { FileVersionHandler } from './events/file-version.handler.js';
import { FavoritesController } from './favorites/favorites.controller.js';
import { FavoriteCardMapper } from './favorites/favorite-card.mapper.js';
import { FavoritesRepository } from './favorites/favorites.repository.js';
import { FavoritesService } from './favorites/favorites.service.js';
import { StickersController } from './stickers/stickers.controller.js';
import { StickersRepository } from './stickers/stickers.repository.js';
import { StickersService } from './stickers/stickers.service.js';
import { VaultController } from './vault/vault.controller.js';
import { VaultRepository } from './vault/vault.repository.js';
import { VaultService } from './vault/vault.service.js';

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
    ConversationMembersController,
    MessagesController,
    MessageActionsController,
    AttachmentsController,
    StickersController,
    FavoritesController,
    UrgentPolicyController,
    VaultController,
  ],
  providers: [
    ConversationsRepository,
    ConversationsService,
    // Участники беседы (#186): добавление/роли/исключение — права матрицей.
    ConversationMembersService,
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
    // Превью вложений (#150, ADR-0015): очередь (продюсер), генератор и
    // in-process воркер — первый потребитель BullMQ (REDIS_URL, core/redis).
    ThumbnailQueue,
    ThumbnailService,
    ThumbnailWorker,
    // Стикер-паки (#143): CRUD/установка/загрузка + чтение для отправки.
    StickersRepository,
    StickersService,
    // Избранное (#171): личные закладки-ссылки, витрина «Избранного».
    FavoritesRepository,
    FavoriteCardMapper,
    FavoritesService,
    // Витрина беседы (#211): серверные списки вложений/ссылок панели
    // «О чате» + денормализованные счётчики (Δ в транзакциях состава).
    VaultRepository,
    VaultService,
    // Политика важных (#177): счётчик дневного лимита для попапа молнии.
    UrgentPolicyReader,
    // Мост версий файлов в беседы (#182): file.version_created →
    // chat.attachment_updated (маршрутизация gateway'ем в conv-комнаты).
    FileVersionHandler,
  ],
})
export class ChatModule {}
