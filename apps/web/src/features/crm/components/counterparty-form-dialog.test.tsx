// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ui } from '@nodus/contracts';
import type { CounterpartyMatch } from '@nodus/contracts';

import { CounterpartyFormDialog } from './counterparty-form-dialog.js';

vi.mock('../../../app/shell/use-card-stack.js', () => ({ useOpenCard: () => vi.fn() }));
vi.mock('../../../shared/api-client.js', () => ({ api: vi.fn() }));

const taken: CounterpartyMatch = {
  id: '70000000-0000-4000-8000-000000000010',
  shortName: 'АО «Галургия»',
  fullName: 'Открытое акционерное общество «Галургия»',
  unp: '100123456',
  archivedAt: null,
  matchedBy: 'unp',
};

function renderDialog() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CounterpartyFormDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CounterpartyFormDialog: точный УНП блокирует создание (#460)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('УНП существующего контрагента — ошибка у поля со ссылкой и «Создать» недоступен', async () => {
    const { api } = await import('../../../shared/api-client.js');
    vi.mocked(api).mockImplementation(async (url: string) => {
      if (url.startsWith('/counterparties/similar')) return [taken] as never;
      return { items: [], nextCursor: null } as never;
    });
    renderDialog();

    fireEvent.change(screen.getByPlaceholderText(ui.counterparties.fullNamePlaceholder), {
      target: { value: 'ООО «Новый заказчик»' },
    });
    fireEvent.change(screen.getByPlaceholderText(ui.counterparties.shortNamePlaceholder), {
      target: { value: 'ООО «Новый заказчик»' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(ui.counterparties.unp) }), {
      target: { value: 'УНП 100 123 456' },
    });

    await waitFor(() => expect(screen.getByText(ui.counterparties.unpTaken)).toBeTruthy());
    expect(screen.getByRole('button', { name: ui.common.create })).toHaveProperty('disabled', true);
    // Ссылка на существующего — в ошибке у поля и строкой в «Похожих».
    expect(screen.getAllByText(new RegExp(taken.shortName)).length).toBeGreaterThan(0);
  });

  it('свободный УНП — «Создать» доступен, панель похожих показывает найденных', async () => {
    const { api } = await import('../../../shared/api-client.js');
    vi.mocked(api).mockImplementation(async (url: string) => {
      if (url.startsWith('/counterparties/similar')) return [] as never;
      return { items: [], nextCursor: null } as never;
    });
    renderDialog();

    fireEvent.change(screen.getByPlaceholderText(ui.counterparties.fullNamePlaceholder), {
      target: { value: 'ООО «Новый заказчик»' },
    });
    fireEvent.change(screen.getByPlaceholderText(ui.counterparties.shortNamePlaceholder), {
      target: { value: 'ООО «Новый заказчик»' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(ui.counterparties.unp) }), {
      target: { value: '999888777' },
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: ui.common.create })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    expect(screen.queryByText(ui.counterparties.unpTaken)).toBeNull();
  });
});
