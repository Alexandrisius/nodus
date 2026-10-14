// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGeometryMotion } from './use-geometry-motion.js';

/**
 * Механика гварда вспышки контура при width-транзициях контейнеров (баг
 * владельца 14.10.2026: «кликаю модули подряд — вспышка перестаёт вылетать,
 * виноват мессенджер»). Переход на/с мессенджера прячет правую служебную
 * полосу — у неё width-транзиция, и она совпадает со сменой фокуса навигации.
 *
 * Гарантии хука (в скобках — регрессии прежнего кода):
 * 1) серия транзиций кончается на ПОСЛЕДНЕЙ transitionend + кадр оседания, а
 *    не на первой (раньше ЛЮБАЯ transitionend снимала гвард, пока рейка и
 *    полоса ещё ехали);
 * 2) кадровый цикл движения — один на серию (onFrames(true) один раз, парный
 *    false — на оседании);
 * 3) отменённый кадр оседания не «съедает» смену фокуса: следующий run несёт
 *    pendingSettle=true — вызывающий дорисовывает недоигранную вспышку;
 * 4) гвард не залипает: события потерялись — страховочный таймер снимает.
 */

const RAF_QUEUE: { id: number; cb: FrameRequestCallback }[] = [];
let rafId = 1;
const RAF_IDS = new Map<number, FrameRequestCallback>();

/** Кадры — вручную и детерминированно: отменённые НЕ исполняются. */
function flushFrames(max = 5) {
  act(() => {
    for (let i = 0; i < max && RAF_QUEUE.length > 0; i++) {
      const frame = RAF_QUEUE.shift()!;
      if (!RAF_IDS.has(frame.id)) continue;
      frame.cb(performance.now());
    }
  });
}

/** `transitionrun`/`transitionend` с propertyName: jsdom не несёт свойства.
 *  Элемент обязан быть в DOM — событие всплывает до document (слушатели хука
 *  стоят в capture-фазе документа). */
function fireTransition(type: 'transitionrun' | 'transitionend', el: Element) {
  if (!el.isConnected) document.body.append(el);
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: 'width' });
  act(() => {
    el.dispatchEvent(event);
  });
}

interface Harness {
  /** Последовательность событий хука: run:<active>:<pendingSettle>, frames:bool,
   *  settle. */
  events: string[];
  /** Признак вызова кадрового цикла (движение) — контурный гвард. */
  frames: boolean[];
}

function Harness({ api }: { api: Harness }) {
  useGeometryMotion({
    onRun: ({ active, pendingSettle }) => api.events.push(`run:${active}:${pendingSettle}`),
    onSettle: () => api.events.push('settle'),
    onFrames: (active) => {
      api.frames.push(active);
      api.events.push(`frames:${active}`);
    },
  });
  return null;
}

function makeHarness() {
  const api: Harness = { events: [], frames: [] };
  render(<Harness api={api} />);
  return api;
}

beforeEach(() => {
  RAF_QUEUE.length = 0;
  RAF_IDS.clear();
  rafId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = rafId++;
    RAF_IDS.set(id, cb);
    RAF_QUEUE.push({ id, cb });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    RAF_IDS.delete(id);
    const i = RAF_QUEUE.findIndex((f) => f.id === id);
    if (i >= 0) RAF_QUEUE.splice(i, 1);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useGeometryMotion: гвард вспышки и width-транзиции контейнеров', () => {
  it('серия: оседание — после ПОСЛЕДНЕЙ транзиции, кадровый цикл — один на серию', () => {
    const api = makeHarness();
    const rail = document.createElement('aside');
    const edge = document.createElement('aside');

    // Переход на мессенджер: рейка и полоса поехали одновременно.
    fireTransition('transitionrun', rail);
    fireTransition('transitionrun', edge);
    expect(api.events).toEqual(['run:false:false', 'frames:true', 'run:true:false']);

    // Рейка осела, полоса ещё едет — оседания НЕТ (регрессия: приходило).
    fireTransition('transitionend', rail);
    flushFrames(2);
    expect(api.events).toEqual(['run:false:false', 'frames:true', 'run:true:false']);
    expect(api.frames).toEqual([true]);

    // Последняя транзиция: кадр оседания — вспышка по осевшей геометрии.
    fireTransition('transitionend', edge);
    flushFrames(2);
    expect(api.events).toEqual([
      'run:false:false',
      'frames:true',
      'run:true:false',
      'frames:false',
      'settle',
    ]);
    // Кадровый цикл закрыт парным false ровно один раз.
    expect(api.frames).toEqual([true, false]);
  });

  it('быстрый клик подряд: run несёт pendingSettle=true (вспышку дорисовывает вызывающий)', () => {
    const api = makeHarness();
    const edge = document.createElement('aside');

    fireTransition('transitionrun', edge);
    flushFrames(2);
    // Первая транзиция осела: кадр оседания запланирован, но не выполнен.
    fireTransition('transitionend', edge);

    // Следующий клик до кадра оседания: кадр отменён — run сообщает об этом.
    fireTransition('transitionrun', edge);
    expect(api.events).toEqual([
      'run:false:false',
      'frames:true',
      'run:true:true', // ← недоигранный settle-кадр отменён
    ]);
    expect(api.frames).toEqual([true]); // цикл не передёрнут

    // Оседание серии: закрытие и settle — события приходят по разу.
    fireTransition('transitionend', edge);
    flushFrames(2);
    expect(api.events).toEqual([
      'run:false:false',
      'frames:true',
      'run:true:true',
      'frames:false',
      'settle',
    ]);
    expect(api.frames).toEqual([true, false]);
  });

  it('посторонняя транзиция (не width) игнорируется', () => {
    const api = makeHarness();
    const el = document.body.appendChild(document.createElement('div'));
    const event = new Event('transitionrun', { bubbles: true });
    Object.defineProperty(event, 'propertyName', { value: 'opacity' });
    act(() => {
      el.dispatchEvent(event);
    });
    expect(api.events).toEqual([]);
  });

  it('события потерялись — страховочный таймер снимает гвард (вспышка не глохнет навсегда)', () => {
    vi.useFakeTimers();
    try {
      const api = makeHarness();
      const rail = document.createElement('aside');
      fireTransition('transitionrun', rail);
      // transitionend не пришёл вовсе (размонтирование элемента/потеря
      // события) — гвард обязан сняться таймером: закрытие + settle.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(api.events).toEqual(['run:false:false', 'frames:true', 'frames:false', 'settle']);
    } finally {
      vi.useRealTimers();
    }
  });
});
