import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { PrismaService } from '../database/prisma.service.js';
import { TransactionRunner } from '../database/transaction-runner.js';

/** Размер батча и период опроса outbox. */
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 1_000;

type HandlerInstance = DomainEventHandler & { constructor: { eventType?: string; name: string } };

/**
 * Диспетчер outbox: поллер читает неопубликованные события из `events`
 * и вызывает подписанные обработчики (регистрация при bootstrap по
 * `static readonly eventType`, декораторы подписки запрещены — patterns.md).
 *
 * Доставка at-least-once: событие помечается published в одной транзакции
 * с доставкой; ошибка обработчика → откат → повтор на следующем опросе.
 * Дедупликация — `event_deliveries` (event_id, handler); обработчик обязан
 * быть идемпотентным (может быть вызван повторно).
 *
 * Монолит single-process (I1): конкуренции поллеров нет, SKIP LOCKED не нужен.
 * При выносе диспетчера в отдельный воркер — добавить claim через
 * `FOR UPDATE SKIP LOCKED` (см. README core).
 */
@Injectable()
export class EventDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly handlers = new Map<string, HandlerInstance[]>();
  private timer: NodeJS.Timeout | null = null;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly txRunner: TransactionRunner,
    private readonly discovery: DiscoveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventDispatcher.name);
  }

  onModuleInit(): void {
    this.registerHandlers();
    this.timer = setInterval(() => {
      void this.dispatchPending();
    }, POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Регистрация обработчиков: провайдеры со `static readonly eventType`. */
  private registerHandlers(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as HandlerInstance | undefined;
      const eventType = instance?.constructor?.eventType;
      if (instance && typeof eventType === 'string' && typeof instance.handle === 'function') {
        const list = this.handlers.get(eventType) ?? [];
        list.push(instance);
        this.handlers.set(eventType, list);
      }
    }
  }

  /** Один проход диспетчеризации (также используется интеграционными тестами). */
  async dispatchPending(): Promise<void> {
    if (this.dispatching) {
      return; // защита от наложения опросов
    }
    this.dispatching = true;
    try {
      const pending = await this.prisma.event.findMany({
        where: { publishedAt: null },
        // Детерминированный порядок (I7): created_at + tiebreaker по id.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      });
      for (const row of pending) {
        await this.dispatchOne(row as unknown as DomainEvent);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchOne(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    try {
      await this.txRunner.run(async (tx) => {
        for (const handler of handlers) {
          const handlerId = handler.constructor.name;
          const delivered = await tx.eventDelivery.findUnique({
            where: { eventId_handler: { eventId: event.id, handler: handlerId } },
          });
          if (delivered) {
            continue; // дедуп по event id (patterns.md)
          }
          await handler.handle(event);
          await tx.eventDelivery.create({ data: { eventId: event.id, handler: handlerId } });
        }
        await tx.event.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      });
    } catch (error) {
      // Событие остаётся неопубликованным — повтор на следующем опросе.
      this.logger.error(
        { eventId: event.id, type: event.type, err: error },
        'Event dispatch failed, will retry',
      );
    }
  }
}
