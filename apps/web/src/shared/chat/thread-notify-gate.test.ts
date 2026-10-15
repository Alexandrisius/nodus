// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';

import { threadNotifyAllowed } from './thread-notify-gate.js';

/**
 * Гейт «наблюдатель трэда» (#300): ответ в трэде уведомляет наблюдателей и
 * @упомянутых; холодный кэш — один догоняющий запрос; сбой сети — не глушим
 * (журнал уже отфильтрован сервером).
 */

const ME = '00000000-0000-4000-8000-000000000001';
const CONV = '00000000-0000-4000-8000-0000000000c1';
const THREAD_ROOT = '00000000-0000-4000-8000-0000000000t1';

function states(roots: string[]) {
  return { items: roots.map((r) => ({ threadRootId: r, watched: true, unreadCount: 0 })) };
}

function queryClient(cached: ReturnType<typeof states> | undefined, fetched?: ReturnType<typeof states> | Error) {
  return {
    getQueryData: () => cached,
    fetchQuery: vi.fn(async () => {
      if (fetched instanceof Error) throw fetched;
      return fetched ?? states([]);
    }),
  } as unknown as QueryClient;
}

describe('threadNotifyAllowed', () => {
  it('наблюдатель (в кэше состояний трэдов) — уведомляем', async () => {
    expect(
      await threadNotifyAllowed(queryClient(states([THREAD_ROOT])), ME, CONV, THREAD_ROOT, []),
    ).toBe(true);
  });

  it('не-наблюдатель — тишина', async () => {
    expect(
      await threadNotifyAllowed(queryClient(states(['другой-тред'])), ME, CONV, THREAD_ROOT, []),
    ).toBe(false);
  });

  it('@упомянутый — уведомляем без запроса', async () => {
    const qc = queryClient(undefined);
    expect(await threadNotifyAllowed(qc, ME, CONV, THREAD_ROOT, [ME])).toBe(true);
    expect(qc.fetchQuery).not.toHaveBeenCalled();
  });

  it('холодный кэш — догоняющий запрос решает', async () => {
    const qc = queryClient(undefined, states([THREAD_ROOT]));
    expect(await threadNotifyAllowed(qc, ME, CONV, THREAD_ROOT, [])).toBe(true);
    expect(qc.fetchQuery).toHaveBeenCalledTimes(1);
  });

  it('сбой догоняющего запроса — не глушим (журнал фильтрует сервер)', async () => {
    const qc = queryClient(undefined, new Error('network'));
    expect(await threadNotifyAllowed(qc, ME, CONV, THREAD_ROOT, [])).toBe(true);
  });
});
