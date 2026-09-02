import { Global, Module } from '@nestjs/common';

import { EventBus } from './event-bus.js';
import { EventDispatcher } from './event-dispatcher.js';

/**
 * События (I9): EventBus (outbox-запись в той же транзакции) + EventDispatcher
 * (доставка подписчикам). Глобально: EventBus доступен всем модулям.
 */
@Global()
@Module({
  providers: [EventBus, EventDispatcher],
  exports: [EventBus],
})
export class EventsModule {}
