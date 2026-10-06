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
  /** In-flight проход диспетчеризации (null — прохода нет). Параллельный вызов
   *  ЖДЁТ чужой проход и делает свой — а не молча уходит no-op'ом:
   *  ручной прогон конвейера поверх фонового тикера читал «пусто» до
   *  записи хендлеров (гонка интеграционных CI, #212). */
  private pass: Promise<void> | null = null;

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

  /** Один проход диспетчеризации (также используется интеграционными
   *  тестами). Проходы не накладываются, но конкурентный вызов ДОЖИДАЕТСЯ
   *  чужого прохода и стартует свой — вызов никогда не «пустой». */
  async dispatchPending(): Promise<void> {
    while (this.pass) {
      await this.pass.catch(() => {}); // чужой проход упал — свой всё равно стартует
    }
    this.pass = this.runPass();
    try {
      await this.pass;
    } finally {
      this.pass = null;
    }
  }

  private async runPass(): Promise<void> {
    const pending = await this.prisma.event.findMany({
      where: { publishedAt: null },
      // Детерминированный порядок (I7): created_at + tiebreaker по id.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
    });
    for (const row of pending) {
      await this.dispatchOne(row as unknown as DomainEvent);
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
      if ((error as { code?: string }).code === 'P2025') {
        // Строка события удалена конкурентно (очистка тестов/retention):
        // повторять нечего — событие уже не существует, пропускаем тихо.
        this.logger.debug(
          { eventId: event.id, type: event.type },
          'Event row deleted concurrently, skip dispatch',
        );
        return;
      }
      // Событие остаётся неопубликованным — повтор на следующем опросе.
      this.logger.error(
        { eventId: event.id, type: event.type, err: error },
        'Event dispatch failed, will retry',
      );
    }
  }
}
