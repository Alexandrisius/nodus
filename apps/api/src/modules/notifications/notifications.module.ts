import { Module } from '@nestjs/common';

import { USER_PROFILE_READER } from '../../core/ports/user-profile.port.js';
import { UserProfileProvider } from '../../core/ports/user-profile.provider.js';
import { ChatPortsModule } from '../chat/chat-ports.module.js';
import { DispatchHandler } from './events/dispatch.handler.js';
import { MessageDeletedHandler } from './events/message-deleted.handler.js';
import { MessageEditedHandler } from './events/message-edited.handler.js';
import { MessageReadHandler } from './events/message-read.handler.js';
import { MessageSentHandler } from './events/message-sent.handler.js';
import { ReactionAddedHandler } from './events/reaction-added.handler.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { BackgroundRetentionJob } from './retention.job.js';
import { UrgentRepeatQueue } from './urgent-repeat.queue.js';
import { UrgentRepeatWorker } from './urgent-repeat.worker.js';

/**
 * Модуль notifications (#100, ADR-0016; приоритеты — ADR-0017): журнал
 * уведомлений — истина; абстрактные приоритеты urgent/high/medium/low
 * (маппинг kind → priority — таблица в priority-resolver); ознакомление для
 * срочного. Связность — только события (I3: подписчики chat.*, эмиттер
 * notification.*) и read-порт членства чата (ADR-0012, ChatPortsModule).
 * Флаг `notifications` (I10): off → хендлеры тихие, эндпоинты NOT_FOUND,
 * чат жив.
 */
@Module({
  imports: [ChatPortsModule],
  controllers: [NotificationsController],
  providers: [
    // Профили сотрудников: read-порт ADR-0012 (users — core-shared); провайдер
    // объявляется каждым модулем-потребителем (прецедент ChatModule).
    UserProfileProvider,
    { provide: USER_PROFILE_READER, useClass: UserProfileProvider },
    NotificationsRepository,
    NotificationsService,
    MessageSentHandler,
    MessageEditedHandler,
    MessageDeletedHandler,
    MessageReadHandler,
    ReactionAddedHandler,
    DispatchHandler,
    UrgentRepeatQueue,
    UrgentRepeatWorker,
    BackgroundRetentionJob,
  ],
})
export class NotificationsModule {}
