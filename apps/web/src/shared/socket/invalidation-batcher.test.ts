import { describe, expect, it, vi } from 'vitest';

import { createKeyBatcher } from './invalidation-batcher.js';

/** Мок-планировщик: имитация setTimeout без реальных таймеров. */
function manualSchedule() {
  const tasks: { at: number; fn: () => void }[] = [];
  let now = 0;
  return {
    schedule: (fn: () => void, ms: number) => {
      const task = { at: now + ms, fn };
      tasks.push(task);
      return () => {
        const index = tasks.indexOf(task);
        if (index >= 0) tasks.splice(index, 1);
      };
    },
    advance: (ms: number) => {
      const target = now + ms;
      for (;;) {
        const next = tasks.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        tasks.splice(tasks.indexOf(next), 1);
        next.fn();
      }
      now = target;
    },
  };
}

describe('createKeyBatcher (коалесцинг инвалидаций, раунд 3)', () => {
  it('ключи одного яруса дедупятся и инвалидируются один раз за окно', () => {
    const clock = manualSchedule();
    const invalidate = vi.fn();
    const batcher = createKeyBatcher(invalidate, { schedule: clock.schedule });
    for (let i = 0; i < 30; i += 1) batcher.push(['chat', 'messages', 'c1'], 'feed');
    batcher.push(['chat', 'conversations'], 'list');
    clock.advance(700); // оба окна (feed 150, list 600) закрылись
    // 30 пушей одного ключа → одна инвалидация; другой ключ — своя.
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith(['chat', 'messages', 'c1']);
    expect(invalidate).toHaveBeenCalledWith(['chat', 'conversations']);
    batcher.dispose();
  });

  it('окно открывается первым ключом и не продлевается (trailing edge)', () => {
    const clock = manualSchedule();
    const invalidate = vi.fn();
    const batcher = createKeyBatcher(invalidate, {
      schedule: clock.schedule,
      windowMs: { feed: 150 },
    });
    batcher.push(['a'], 'feed');
    clock.advance(100);
    batcher.push(['b'], 'feed'); // не продлевает окно
    clock.advance(60); // 160 от первого пуша
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith(['a']);
    expect(invalidate).toHaveBeenCalledWith(['b']);
    batcher.dispose();
  });

  it('разные ярусы — независимые окна (list медленнее feed)', () => {
    const clock = manualSchedule();
    const invalidate = vi.fn();
    const batcher = createKeyBatcher(invalidate, {
      schedule: clock.schedule,
      windowMs: { feed: 150, list: 600 },
    });
    batcher.push(['feed-key'], 'feed');
    batcher.push(['list-key'], 'list');
    clock.advance(200);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(['feed-key']);
    clock.advance(500);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith(['list-key']);
    batcher.dispose();
  });

  it('flush — немедленно всё накопленное (reconnect), dispose — гасит окна', () => {
    const clock = manualSchedule();
    const invalidate = vi.fn();
    const batcher = createKeyBatcher(invalidate, { schedule: clock.schedule });
    batcher.push(['a'], 'feed');
    batcher.push(['b'], 'list');
    batcher.flush();
    expect(invalidate).toHaveBeenCalledTimes(2);
    // После flush окно не стреляет повторно.
    invalidate.mockClear();
    clock.advance(1000);
    expect(invalidate).not.toHaveBeenCalled();
    batcher.push(['c'], 'feed');
    batcher.dispose();
    clock.advance(1000);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('createKeyBatcher: таймеры по умолчанию', () => {
  it('реальный setTimeout-планировщик (smoke на fake-таймерах vitest)', () => {
    vi.useFakeTimers();
    const invalidate = vi.fn();
    const batcher = createKeyBatcher(invalidate, { windowMs: { feed: 150, list: 600 } });
    batcher.push(['x'], 'feed');
    vi.advanceTimersByTime(149);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(invalidate).toHaveBeenCalledWith(['x']);
    batcher.dispose();
    vi.useRealTimers();
  });
});
