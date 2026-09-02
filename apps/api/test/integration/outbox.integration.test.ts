import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@nodus/contracts';

import { PrismaService } from '../../src/core/database/prisma.service.js';
import { TransactionRunner } from '../../src/core/database/transaction-runner.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventDispatcher } from '../../src/core/events/event-dispatcher.js';
import { ensureTestDatabase } from './test-db.js';

/**
 * Transactional outbox на реальной БД (критерий приёмки issue #2):
 * событие пишется в events в той же транзакции, что и изменение сущности.
 */

class TestHandler {
  static readonly eventType = 'test.ping';
  received: DomainEvent[] = [];
  async handle(event: DomainEvent): Promise<void> {
    this.received.push(event);
  }
}

describe.skipIf(!process.env.DATABASE_URL)('outbox (integration)', () => {
  let prisma: PrismaService;
  let txRunner: TransactionRunner;
  let eventBus: EventBus;
  let handler: TestHandler;
  let dispatcher: EventDispatcher;

  beforeAll(async () => {
    const url = await ensureTestDatabase(`${__dirname}/../..`);
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    txRunner = new TransactionRunner(prisma);
    eventBus = new EventBus();
    handler = new TestHandler();
    dispatcher = new EventDispatcher(
      prisma,
      txRunner,
      { getProviders: () => [{ instance: handler }] } as never,
      { setContext: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
    );
    dispatcher.onModuleInit(); // регистрация обработчиков (таймер unref — не мешает выходу)
    await prisma.eventDelivery.deleteMany();
    await prisma.event.deleteMany();
  });

  afterAll(async () => {
    dispatcher.onModuleDestroy();
    await prisma.eventDelivery.deleteMany();
    await prisma.event.deleteMany();
    await prisma.$disconnect();
  });

  it('откат транзакции → событие НЕ сохраняется (атомарность)', async () => {
    await expect(
      txRunner.run(async (tx) => {
        await eventBus.emit(tx, 'test.ping', { id: 'rollback' }, { aggregateType: 'test' });
        throw new Error('сбой после записи события');
      }),
    ).rejects.toThrow('сбой после записи события');

    expect(await prisma.event.count()).toBe(0);
  });

  it('коммит → событие в events; диспетчер доставляет и помечает published', async () => {
    await txRunner.run(async (tx) => {
      await eventBus.emit(tx, 'test.ping', { id: 'commit' }, { aggregateType: 'test' });
    });
    expect(await prisma.event.count({ where: { publishedAt: null } })).toBe(1);

    await dispatcher.dispatchPending();

    expect(handler.received).toHaveLength(1);
    expect(handler.received[0].type).toBe('test.ping');
    expect(await prisma.event.count({ where: { publishedAt: null } })).toBe(0);
    expect(await prisma.eventDelivery.count()).toBe(1);

    // Повторный проход — дубля доставки нет (дедуп по event id).
    await dispatcher.dispatchPending();
    expect(handler.received).toHaveLength(1);
  });
});
