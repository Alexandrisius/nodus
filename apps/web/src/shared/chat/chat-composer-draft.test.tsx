// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../api-client.js', () => ({ api: apiMock, apiUpload: vi.fn() }));

import { ChatComposer } from './chat-composer.js';
import { useChatDrafts } from './chat-drafts.js';
import { chatKeys } from './api.js';

/** Флуш черновика при ПЕРЕКЛЮЧЕНИИ бесед (дефект приёмки 25.09): ChatComposer
 *  переиспользуется (focusId меняется без ремаунта) — cleanup-эффект обязан
 *  зафиксировать черновик ПРЕДЫДУЩЕЙ беседы, а инвалидация списка должна
 *  приходить ПОСЛЕ завершения PUT (иначе refetch обгонял PUT и список
 *  приходил без метки «Черновик»). */

const CONV_A = '11111111-1111-4111-8111-111111111111';
const CONV_B = '22222222-2222-4222-8222-222222222222';

// useGrown композера слушает textarea — ResizeObserver в jsdom нет.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function renderComposer(client: QueryClient, focusId: string, conversationId: string) {
  const events: string[] = [];
  apiMock.mockImplementation(() => {
    events.push('put');
    return Promise.resolve(undefined);
  });
  const invalidateCalls: unknown[][] = [];
  const invalidateSpy = vi
    .spyOn(client, 'invalidateQueries')
    .mockImplementation((...args: unknown[]) => {
      events.push('invalidate');
      invalidateCalls.push(args);
      return Promise.resolve() as never;
    });
  const view = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ChatComposer, {
        placeholder: 'Поле ввода',
        focusId,
        conversationId,
        onSubmit: () => {},
      }),
    ),
  );
  return { view, events, invalidateSpy, invalidateCalls };
}

describe('ChatComposer — черновик при переключении бесед', () => {
  let client: QueryClient;
  beforeEach(() => {
    apiMock.mockReset();
    useChatDrafts.setState({ drafts: {} });
    client = new QueryClient();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('смена focusId фиксирует черновик ПРЕДЫДУЩЕЙ беседы; список инвалидируется ПОСЛЕ PUT', async () => {
    const { view, events, invalidateSpy, invalidateCalls } = renderComposer(
      client,
      `conversation:${CONV_A}`,
      CONV_A,
    );
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'черновик беседы А' } });
    await waitFor(() =>
      expect(useChatDrafts.getState().drafts[`conversation:${CONV_A}`]?.text).toBe(
        'черновик беседы А',
      ),
    );
    expect(apiMock).not.toHaveBeenCalled(); // набор — молча

    // Переключение беседы А→Б: композер переиспользуется, focusId меняется.
    view.rerender(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ChatComposer, {
          placeholder: 'Поле ввода',
          focusId: `conversation:${CONV_B}`,
          conversationId: CONV_B,
          onSubmit: () => {},
        }),
      ),
    );
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/chat/conversations/${CONV_A}/draft`,
        expect.objectContaining({ method: 'PUT', body: { text: 'черновик беседы А' } }),
      ),
    );
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(invalidateCalls.at(-1)?.[0]).toMatchObject({ queryKey: chatKeys.conversations() });
    // PUT завершён ДО инвалидации: refetch не обгоняет фиксацию черновика.
    expect(events.indexOf('put')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('invalidate')).toBeGreaterThan(events.indexOf('put'));
  });

  it('размонтирование с текстом — флуш текущей беседы', async () => {
    const { view } = renderComposer(client, `conversation:${CONV_A}`, CONV_A);
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'ушёл из модуля' } });
    view.unmount();
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/chat/conversations/${CONV_A}/draft`,
        expect.objectContaining({ method: 'PUT', body: { text: 'ушёл из модуля' } }),
      ),
    );
  });
});

describe('ChatComposer — каретка в конец восстановленного черновика', () => {
  it('смена focusId с непустым черновиком новой беседы → фокус ставит каретку в КОНЕЦ текста', async () => {
    const client = new QueryClient();
    useChatDrafts.setState({
      drafts: {
        [`conversation:${CONV_B}`]: {
          text: 'продолжение с места остановки',
          attachments: [],
          reply: null,
          edit: null,
          preEditText: null,
        },
      },
    });
    const { view } = renderComposer(client, `conversation:${CONV_A}`, CONV_A);
    view.rerender(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ChatComposer, {
          placeholder: 'Поле ввода',
          focusId: `conversation:${CONV_B}`,
          conversationId: CONV_B,
          onSubmit: () => {},
        }),
      ),
    );
    const textarea = view.container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    expect(textarea.selectionStart).toBe('продолжение с места остановки'.length);
    expect(textarea.selectionEnd).toBe('продолжение с места остановки'.length);
  });
});
