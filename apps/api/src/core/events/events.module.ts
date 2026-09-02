import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { EventBus } from './event-bus.js';
import { EventDispatcher } from './event-dispatcher.js';

/**
 * События (I9): EventBus (outbox-запись в той же транзакции) + EventDispatcher
 * (доставка подписчикам). Глобально: EventBus доступен всем модулям.
 * DiscoveryModule — скан провайдеров со `static readonly eventType` при bootstrap.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [EventBus, EventDispatcher],
  exports: [EventBus],
})
export class EventsModule {}
