import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createReadReceiptScheduler } from './viewport-read-scheduler.js';

/** Квитанции просмотров (#102 раунд 2): троттл-планировщик — только вперёд,
 *  не чаще раза в THROTTLE_MS, скрытый таб не отправляет, flush на уходе. */
describe('createReadReceiptScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeSuite(hidden: () => boolean = () => false) {
    const sends: number[] = [];
    const scheduler = createReadReceiptScheduler({
      send: (seq) => sends.push(seq),
      throttleMs: 500,
      isHidden: hidden,
    });
    return { scheduler, sends };
  }

  it('троттл: серия наблюдений в окне 500 мс уходит ОДНОЙ квитанцией (максимальной)', () => {
    const { scheduler, sends } = makeSuite();
    scheduler.observe(3);
    scheduler.observe(5);
    scheduler.observe(4); // назад — не двигает
    vi.advanceTimersByTime(500);
    expect(sends).toEqual([5]);
  });

  it('только вперёд: seq ниже отправленного — тишина (серверный GREATEST не дёргаем)', () => {
    const { scheduler, sends } = makeSuite();
    scheduler.observe(10);
    vi.advanceTimersByTime(500);
    scheduler.observe(7); // проскроллил вверх
    vi.advanceTimersByTime(2000);
    expect(sends).toEqual([10]);
  });

  it('непрерывный скролл: квитанции не чаще раза в 500 мс, растущим seq', () => {
    const { scheduler, sends } = makeSuite();
    scheduler.observe(1);
    vi.advanceTimersByTime(500); // → 1
    scheduler.observe(2);
    vi.advanceTimersByTime(250);
    scheduler.observe(3); // в окне кулдауна — обновляет pending
    vi.advanceTimersByTime(250); // таймер первого observe — стреляет 3
    scheduler.observe(4);
    vi.advanceTimersByTime(500); // → 4
    expect(sends).toEqual([1, 3, 4]);
  });

  it('скрытый таб не отправляет: pending ждёт возврата видимости', () => {
    const hidden = { value: true };
    const { scheduler, sends } = makeSuite(() => hidden.value);
    scheduler.observe(6);
    vi.advanceTimersByTime(500);
    expect(sends).toEqual([]); // скрыт — не ушло
    hidden.value = false;
    scheduler.observe(6); // вкладка вернулась — тот же seq достаточно
    vi.advanceTimersByTime(500);
    expect(sends).toEqual([6]);
  });

  it('flush на уходе из беседы: накопленное уходит немедленно (это видели)', () => {
    const { scheduler, sends } = makeSuite(() => true);
    scheduler.observe(8);
    scheduler.flush(); // flush НЕ упирается в guard скрытости
    expect(sends).toEqual([8]);
  });

  it('dispose: накопленное сбрасывается без отправки', () => {
    const { scheduler, sends } = makeSuite();
    scheduler.observe(8);
    scheduler.dispose();
    vi.advanceTimersByTime(2000);
    expect(sends).toEqual([]);
  });

  it('null и пустые наблюдения — тишина', () => {
    const { scheduler, sends } = makeSuite();
    scheduler.observe(null);
    vi.advanceTimersByTime(1000);
    expect(sends).toEqual([]);
  });
});
