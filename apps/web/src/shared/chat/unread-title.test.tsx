// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { chatKeys } from './api.js';
import { applyReadToCache } from './use-viewport-read.js';
import { useUnreadTitle } from './unread-title.js';

/**
 * ЦЕПОЧКА бейджа (#254 «зомби»): title считается из кэша списка бесед;
 * квитанция прочтения обязана занулять счётчик в кэше немедленно — даже
 * если следующий сетевой рефеч (гонка с коммитом read) вернул СТАРОЕ число.
 * Воспроизводим: список(unread=3) → квитанция → рефеч со старым ответом →
 * title обязан показать 0 (сервер уже подтвердил read 200).
 */

const CONV = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';

function withClient(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('цепочка бейджа непрочитанных', () => {
  it('квитанция гасит счётчик; устаревший рефеч не воскрешает его', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Список: у беседы 3 непрочитанных (стартовое состояние из сети).
    const list = {
      items: [
        { id: CONV, unreadCount: 3 },
        { id: OTHER, unreadCount: 0 },
      ],
    };
    const fetchMock = vi.fn(async () => list);
    qc.setQueryData(chatKeys.conversations(), list);

    const { result } = renderHook(() => useUnreadTitle(), { wrapper: withClient(qc) });
    await waitFor(() => expect(document.title).toBe('(3) Nodus'));

    // Квитанция прочтения (сервисный уровень уже получил 200):
    await act(async () => {
      applyReadToCache(qc, CONV);
      // Гонка: фоновый рефеч получил ответ ДО коммита read — старые цифры.
      qc.setQueryData(chatKeys.conversations(), {
        items: [
          { id: CONV, unreadCount: 3 },
          { id: OTHER, unreadCount: 0 },
        ],
      });
    });
    await waitFor(() => expect(result.current).toBeUndefined());

    // Сценарий «клиент прочёл после рефеча» (порядок из живой пробы):
    // 1) сетевой ответ вернул старое → кэш снова 3; 2) патч квитанции → 0.
    await act(async () => {
      qc.setQueryData(chatKeys.conversations(), {
        items: [
          { id: CONV, unreadCount: 3 },
          { id: OTHER, unreadCount: 0 },
        ],
      });
      applyReadToCache(qc, CONV);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(document.title).toBe('Nodus'));
  });

  it('applyReadToCache зануляет только прочитанную беседу', () => {
    const qc = new QueryClient();
    qc.setQueryData(chatKeys.conversations(), {
      items: [
        { id: CONV, unreadCount: 4 },
        { id: OTHER, unreadCount: 2 },
      ],
    });
    applyReadToCache(qc, CONV);
    expect(
      qc.getQueryData<{ items: { id: string; unreadCount: number }[] }>(chatKeys.conversations())
        ?.items,
    ).toEqual([
      { id: CONV, unreadCount: 0 },
      { id: OTHER, unreadCount: 2 },
    ]);
  });
});
