import { describe, expect, it, vi } from 'vitest';

import {
  stageMessengerThread,
  subscribeMessengerThread,
  takeMessengerThread,
} from './messenger-nav.js';

/** Пристройка треда к мессенджер-карточке (#300): одноразовое потребление +
 *  подписка живой карточки (клик по уведомлению при уже открытой карточке). */

const CONV = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';
const THREAD = '00000000-0000-4000-8000-000000000071';

describe('messenger-nav', () => {
  it('потребление одноразовое и только своей беседы', () => {
    expect(takeMessengerThread(OTHER)).toBe(null);
    stageMessengerThread(CONV, THREAD);
    expect(takeMessengerThread(OTHER)).toBe(null);
    expect(takeMessengerThread(CONV)).toBe(THREAD);
    expect(takeMessengerThread(CONV)).toBe(null);
  });

  it('подписка живой карточки срабатывает на пристойку её беседы', () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeMessengerThread(() => seen.push(takeMessengerThread(CONV)));
    stageMessengerThread(OTHER, THREAD); // чужая беседа — колбэк молчит (null)
    expect(seen).toEqual([null]);
    stageMessengerThread(CONV, THREAD);
    expect(seen).toEqual([null, THREAD]); // потреблено сразу, no-op openCard не мешает
    unsub();
    stageMessengerThread(CONV, THREAD); // после отписки — ждёт нового потребителя
    expect(takeMessengerThread(CONV)).toBe(THREAD);
  });

  it('отписка снимает слушателя', () => {
    const fn = vi.fn();
    const unsub = subscribeMessengerThread(fn);
    unsub();
    stageMessengerThread(CONV, THREAD);
    expect(fn).not.toHaveBeenCalled();
    takeMessengerThread(CONV);
  });
});
