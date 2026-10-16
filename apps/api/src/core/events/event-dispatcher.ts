import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import type { DomainEvent, DomainEventHandler } from '@nodus/contracts';

import { PrismaService } from '../database/prisma.service.js';

/** Размер батча и период опроса outbox. */
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 1_000;

/** Бэкофф упорно падающего события: первые попытки — каждый опрос (сбой
 *  обычно транзиентный: блокировка, рестарт Redis), затем экспонента до
 *  потолка. Событие НЕ выбрасывается — повтор вечен, но не забивает голову
 *  батча и не спамит лог каждую секунду (ядовитое FK-событие #267). */
const FREE_RETRIES = 2;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;
/** С этой попытки событие помечается в логе как «ядовитое» — сигнал оператору. */
const POISON_ATTEMPTS = 8;

type HandlerInstance = DomainEventHandler & { constructor: { eventType?: string; name: string } };

interface RetryState {
  attempts: number;
  retryAt: number;
}

/**
 * Диспетчер outbox: поллер читает неопубликованные события из `events`
 * и вызывает подписанные обработчики (регистрация при bootstrap по
 * `static readonly eventType`, декораторы подписки запрещены — patterns.md).
 *
 * Доставка at-least-once, прогресс — ПО ОБРАБОТЧИКУ: успешный обработчик
 * сразу фиксирует доставку в `event_deliveries` (event_id, handler), и при
 * падении соседа не перевызывается; событие помечается published, когда все
 * обработчики отметились. Обработчик исполняется ВНЕ транзакции диспетчера:
 * у него свои транзакции (TransactionRunner), а обёртка лишь держала бы
 * второе соединение пула и убивала медленный обработчик tx-таймаутом.
 * Обработчик обязан быть идемпотентным (крэш между его коммитом и записью
 * доставки → повторный вызов).
 *
 * Порядок выборки — `seq` (глобальная последовательность БД, парциальный
 * индекс `events_dispatch_pending_idx`). Падающее событие уходит в бэкофф
 * (in-memory, сбрасывается рестартом) и исключается из выборки, чтобы пачка
 * ядовитых событий не заблокировала голову очереди для остальных.
 *
 * Монолит single-process (I1): конкуренции поллеров нет, SKIP LOCKED не нужен.
 * При выносе диспетчера в отдельный воркер — добавить claim через
 * `FOR UPDATE SKIP LOCKED` (см. README core).
 */
@Injectable()
export class EventDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly handlers = new Map<string, HandlerInstance[]>();
  private readonly retries = new Map<string, RetryState>();
  private timer: NodeJS.Timeout | null = null;
  /** In-flight проход диспетчеризации (null — прохода нет). Параллельный вызов
   *  ЖДЁТ чужой проход и делает свой — а не молча уходит no-op'ом:
   *  ручной прогон конвейера поверх фонового тикера читал «пусто» до
   *  записи хендлеров (гонка интеграционных CI, #212). */
  private pass: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
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
    const deferred = this.deferredIds(Date.now());
    const pending = await this.prisma.event.findMany({
      where: { publishedAt: null, ...(deferred.length > 0 ? { id: { notIn: deferred } } : {}) },
      // Детерминированный порядок (I7): глобальная последовательность БД.
      orderBy: { seq: 'asc' },
      take: BATCH_SIZE,
    });
    for (const row of pending) {
      await this.dispatchOne(row as unknown as DomainEvent);
    }
  }

  /** Id событий, чей бэкофф ещё не истёк (исключаются из выборки). */
  private deferredIds(now: number): string[] {
    const ids: string[] = [];
    for (const [id, state] of this.retries) {
      if (state.retryAt > now) ids.push(id);
    }
    return ids;
  }

  private async dispatchOne(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    try {
      for (const handler of handlers) {
        await this.deliver(event, handler);
      }
      // updateMany: строку события могли удалить конкурентно (очистка
      // тестов/retention) — тогда помечать нечего, это не ошибка.
      await this.prisma.event.updateMany({
        where: { id: event.id, publishedAt: null },
        data: { publishedAt: new Date() },
      });
      this.retries.delete(event.id);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2003') {
        // Строка события удалена конкурентно — FK доставки не на что
        // ссылаться: повторять нечего, пропускаем тихо.
        this.logger.debug(
          { eventId: event.id, type: event.type },
          'Event row deleted concurrently, skip dispatch',
        );
        this.retries.delete(event.id);
        return;
      }
      this.scheduleRetry(event, error);
    }
  }

  /** Доставка одному обработчику с дедупом по (event_id, handler). */
  private async deliver(event: DomainEvent, handler: HandlerInstance): Promise<void> {
    const handlerId = handler.constructor.name;
    const delivered = await this.prisma.eventDelivery.findUnique({
      where: { eventId_handler: { eventId: event.id, handler: handlerId } },
    });
    if (delivered) {
      return; // дедуп по event id (patterns.md)
    }
    await handler.handle(event);
    await this.prisma.eventDelivery.createMany({
      data: [{ eventId: event.id, handler: handlerId }],
      skipDuplicates: true,
    });
  }

  /** Событие остаётся неопубликованным — повтор позже (с бэкоффом). */
  private scheduleRetry(event: DomainEvent, error: unknown): void {
    const attempts = (this.retries.get(event.id)?.attempts ?? 0) + 1;
    const delay =
      attempts <= FREE_RETRIES
        ? 0
        : Math.min(BACKOFF_BASE_MS * 2 ** (attempts - FREE_RETRIES - 1), BACKOFF_MAX_MS);
    this.retries.set(event.id, { attempts, retryAt: Date.now() + delay });
    this.logger.error(
      { eventId: event.id, type: event.type, attempts, retryInMs: delay, err: error },
      attempts >= POISON_ATTEMPTS
        ? 'Event dispatch keeps failing (poison event), will retry with backoff'
        : 'Event dispatch failed, will retry',
    );
  }
}
