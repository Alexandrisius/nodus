// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@nodus/contracts';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../api-client.js', () => ({ api: apiMock, apiUpload: vi.fn() }));

import { UrgentAckChip, UrgentChips } from './urgent-chips.js';

/** Чипы важного на пузыре (#177, замечание валидатора): получателю
 *  requireAck — кнопка «Ознакомлен» (клик → оптимистичное «Ознакомлен ✓»);
 *  404 self-ack (поздне-добавленный участник, G3) — кнопки НЕТ; автору и
 *  витрине (noReceipts) ack-часть не рендерится. */

const CONV = '11111111-1111-4111-8111-111111111111';
const MSG = '22222222-2222-4222-8222-222222222222';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: MSG,
    conversationId: CONV,
    seq: 1,
    author: { id: 'a-1', displayName: 'Анна Смирнова', avatarUrl: null },
    text: 'Завтра объект закрыт',
    replyToId: null,
    reply: null,
    threadRootId: null,
    threadRepliesCount: 0,
    reactions: [],
    attachments: [],
    editedAt: null,
    deletedAt: null,
    pinned: false,
    forwardedFrom: null,
    readAt: null,
    readBy: [],
    urgent: true,
    requireAck: true,
    mentionedUserIds: [],
    createdAt: '2026-10-04T10:00:00Z',
    ...overrides,
  };
}

function renderWith(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return render(createElement(Wrapper, null, node));
}

beforeEach(() => {
  apiMock.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('UrgentAckChip (#177)', () => {
  it('получателю requireAck — кнопка «Ознакомлен»; клик → «Ознакомлен ✓»', async () => {
    apiMock.mockImplementation((_path: string, opts?: { method?: string }) => {
      if ((opts?.method ?? 'GET') === 'GET') {
        return Promise.resolve({ messageId: MSG, ackedAt: null });
      }
      return Promise.resolve({});
    });
    renderWith(createElement(UrgentAckChip, { messageId: MSG }));
    const button = await screen.findByRole('button', { name: /Ознакомлен/ });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText('Ознакомлен ✓')).toBeDefined();
    });
    expect(apiMock).toHaveBeenCalledWith(
      `/notifications/urgent/${MSG}/ack`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('404 self-ack (не адресат) — кнопка не рендерится', async () => {
    apiMock.mockRejectedValue(Object.assign(new Error('not found'), {}));
    const { container } = renderWith(createElement(UrgentAckChip, { messageId: MSG }));
    await waitFor(() => {
      expect(container.querySelector('[data-slot="urgent-ack-button"]')).toBeNull();
    });
  });
});

describe('UrgentChips (#177)', () => {
  it('автору (mine) — только метка «Важное», без ack-кнопки', async () => {
    apiMock.mockResolvedValue({ messageId: MSG, ackedAt: null });
    const { container } = renderWith(
      createElement(UrgentChips, { message: makeMessage(), mine: true }),
    );
    await waitFor(() => {
      expect(container.querySelector('[data-slot="urgent-chip"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-slot="urgent-ack-button"]')).toBeNull();
  });

  it('noReceipts (витрина) — ack-часть скрыта, метка остаётся', async () => {
    apiMock.mockResolvedValue({ messageId: MSG, ackedAt: null });
    const { container } = renderWith(
      createElement(UrgentChips, { message: makeMessage(), mine: false, noReceipts: true }),
    );
    await waitFor(() => {
      expect(container.querySelector('[data-slot="urgent-chip"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-slot="urgent-ack-button"]')).toBeNull();
  });

  it('не-urgent сообщение — чипов нет вовсе', () => {
    apiMock.mockResolvedValue({ messageId: MSG, ackedAt: null });
    const { container } = renderWith(
      createElement(UrgentChips, { message: makeMessage({ urgent: false }), mine: false }),
    );
    expect(container.querySelector('[data-slot="urgent-chips"]')).toBeNull();
  });
});
