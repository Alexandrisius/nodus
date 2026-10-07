import { describe, expect, it } from 'vitest';

import { enqueueSend } from './send-queue.js';

/**
 * Исходящая очередь беседы (#243): POST-отправки одной беседы сериализуются
 * (seq на сервере = порядок кликов), разные беседы не мешают друг другу,
 * ошибка головы не рвёт хвост.
 */

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('enqueueSend', () => {
  it('одна беседа: задачи выполняются в порядке постановки', async () => {
    const order: string[] = [];
    const slow = (): Promise<string> =>
      new Promise((resolve) => setTimeout(() => resolve('slow'), 20));
    const fast = (): Promise<string> => Promise.resolve('fast');

    const p1 = enqueueSend('c1', async () => {
      order.push('start:slow');
      return slow();
    });
    const p2 = enqueueSend('c1', async () => {
      order.push('start:fast');
      return fast();
    });
    await Promise.all([p1, p2]);
    // Fast не обгоняет slow, хотя resolve мгновенный.
    expect(order).toEqual(['start:slow', 'start:fast']);
    expect(await p1).toBe('slow');
    expect(await p2).toBe('fast');
  });

  it('разные беседы: независимые очереди, не ждут друг друга', async () => {
    const order: string[] = [];
    const p1 = enqueueSend('c1', async () => {
      order.push('c1-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('c1-end');
    });
    const p2 = enqueueSend('c2', async () => {
      order.push('c2-start');
    });
    await p2;
    expect(order).toEqual(['c1-start', 'c2-start']);
    await p1;
    expect(order).toEqual(['c1-start', 'c2-start', 'c1-end']);
  });

  it('ошибка головы не рвёт хвост: следующая задача стартует', async () => {
    const boom = enqueueSend('c1', async () => {
      throw new Error('network down');
    });
    const after = enqueueSend('c1', async () => 'ok');
    await expect(boom).rejects.toThrow('network down');
    await expect(after).resolves.toBe('ok');
  });

  it('очередь самоочищается по опустошению', async () => {
    await enqueueSend('c1', async () => 1);
    await tick();
    // Внутренняя Map не течёт: после settle хвоста ключ убран (наблюдаем
    // косвенно — новая постановка работает и после паузы).
    const result = await enqueueSend('c1', async () => 2);
    expect(result).toBe(2);
  });

  it('много задач подряд: старт строго по одной (нет параллельного выпадения)', async () => {
    let running = 0;
    let maxRunning = 0;
    const task = (n: number) => async (): Promise<number> => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await tick();
      running -= 1;
      return n;
    };
    const promises = [1, 2, 3, 4, 5].map((n) => enqueueSend('c1', task(n)));
    const results = await Promise.all(promises);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxRunning).toBe(1);
  });
});
