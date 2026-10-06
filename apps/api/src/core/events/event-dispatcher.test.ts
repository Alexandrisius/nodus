import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '@nodus/contracts';

import type { PrismaService } from '../database/prisma.service.js';
import type { TransactionRunner, TransactionClient } from '../database/transaction-runner.js';
import { EventDispatcher } from './event-dispatcher.js';

const EVENT = {
  id: 'e1',
  type: 'task.created',
  actorId: null,
  payload: { id: 't1' },
  createdAt: new Date().toISOString(),
} as unknown as DomainEvent;

class TestHandler {
  static readonly eventType = 'task.created';
  handle = vi.fn().mockResolvedValue(undefined);
}

function createDispatcher(options: { delivered?: boolean; handlerError?: Error } = {}) {
  const handler = new TestHandler();
  const tx = {
    eventDelivery: {
      findUnique: vi.fn().mockResolvedValue(options.delivered ? { id: 1 } : null),
      create: vi.fn().mockResolvedValue({}),
    },
    event: { update: vi.fn().mockResolvedValue({}) },
  } as unknown as TransactionClient;
  if (options.handlerError) {
    handler.handle.mockRejectedValue(options.handlerError);
  }
  const txRunner = { run: vi.fn((fn: (tx: TransactionClient) => Promise<void>) => fn(tx)) };
  const prisma = { event: { findMany: vi.fn().mockResolvedValue([EVENT]) } };
  const discovery = { getProviders: () => [{ instance: handler }] };
  const logger = { setContext: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const dispatcher = new EventDispatcher(
    prisma as unknown as PrismaService,
    txRunner as unknown as TransactionRunner,
    discovery as never,
    logger as never,
  );
  dispatcher.onModuleInit();
  dispatcher.onModuleDestroy();
  return { dispatcher, handler, tx, txRunner, logger };
}

describe('EventDispatcher', () => {
  it('доставляет событие подписанному обработчику и помечает published', async () => {
    const { dispatcher, handler, tx } = createDispatcher();
    await dispatcher.dispatchPending();
    expect(handler.handle).toHaveBeenCalledWith(EVENT);
    expect(tx.eventDelivery.create).toHaveBeenCalledWith({
      data: { eventId: 'e1', handler: 'TestHandler' },
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('дедупликация: уже доставленное обработчику событие не вызывает его повторно', async () => {
    const { dispatcher, handler } = createDispatcher({ delivered: true });
    await dispatcher.dispatchPending();
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('ошибка обработчика → событие остаётся неопубликованным (повтор позже)', async () => {
    const { dispatcher, tx, logger } = createDispatcher({
      handlerError: new Error('boom'),
    });
    await dispatcher.dispatchPending();
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('P2025 на tx (строку события удалили конкурентно) — тихий скип, без retry-шума', async () => {
    const { dispatcher: d2, logger: log2, txRunner } = createDispatcher();
    const p2025 = Object.assign(new Error('No record was found for an update.'), {
      code: 'P2025',
    });
    (txRunner.run as { mockImplementation: (fn: unknown) => Promise<void> }).mockImplementation(
      async () => {
        throw p2025;
      },
    );
    await d2.dispatchPending();
    expect(log2.error).not.toHaveBeenCalled();
    expect(log2.debug).toHaveBeenCalled();
  });

  it('конкурентный вызов ДОЖИДАЕТСЯ in-flight прохода и делает свой (не no-op)', async () => {
    // Фоновый тик диспетчера держит проход (медленный хендлер #212),
    // тестовый dispatchPending приходит поверх — обязан дождаться и
    // увидеть результат, а не вернуться «пустым» до записи хендлера.
    const handler = new TestHandler();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    handler.handle.mockImplementation(async () => {
      await gate;
    });
    const tx = {
      eventDelivery: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      event: { update: vi.fn().mockResolvedValue({}) },
    } as unknown as TransactionClient;
    const txRunner = { run: vi.fn((fn: (tx: TransactionClient) => Promise<void>) => fn(tx)) };
    let findManyCalls = 0;
    const prisma = {
      event: {
        findMany: vi.fn().mockImplementation(async () => {
          findManyCalls += 1;
          return findManyCalls === 1 ? [EVENT] : [];
        }),
      },
    };
    const discovery = { getProviders: () => [{ instance: handler }] };
    const logger = { setContext: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const dispatcher = new EventDispatcher(
      prisma as unknown as PrismaService,
      txRunner as unknown as TransactionRunner,
      discovery as never,
      logger as never,
    );
    dispatcher.onModuleInit(); // регистрация хендлеров
    dispatcher.onModuleDestroy();

    const background = dispatcher.dispatchPending(); // «тикер» начал проход
    await vi.waitFor(() => expect(handler.handle).toHaveBeenCalled()); // проход внутри хендла
    const foreground = dispatcher.dispatchPending(); // тестовый вызов поверх
    release(); // хендлер фонового прохода отпущен
    await Promise.all([background, foreground]);

    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { publishedAt: expect.any(Date) },
    });
  });
});
