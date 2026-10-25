// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Permission, ui } from '@nodus/contracts';
import type { CounterpartyListItem, CounterpartyMatch } from '@nodus/contracts';

import { useAuthStore } from '../auth-store.js';
import { CounterpartyCombobox } from './counterparty-combobox.js';

vi.mock('../api-client.js', () => ({ api: vi.fn() }));

const USER = {
  id: '90000000-0000-4000-8000-000000000001',
  email: 'user@nodus.by',
  displayName: 'Сотрудник',
  permissions: [] as string[],
};

const existing: CounterpartyListItem = {
  id: '70000000-0000-4000-8000-000000000001',
  fullName: 'Открытое акционерное общество «Галургия»',
  shortName: 'АО «Галургия»',
  unp: '100123456',
  address: null,
  email: null,
  phone: null,
  lettersCount: 0,
  projectsCount: 0,
  contactsCount: 0,
  archivedAt: null,
};

const similar: CounterpartyMatch = {
  id: '70000000-0000-4000-8000-000000000002',
  shortName: 'ООО «Галургея»',
  fullName: 'Общество с ограниченной ответственностью «Галургея»',
  unp: null,
  archivedAt: null,
  matchedBy: 'name',
};

function setPermissions(permissions: string[]) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'token',
    user: { ...USER, permissions },
  });
}

async function stubApi() {
  const { api } = await import('../api-client.js');
  vi.mocked(api).mockImplementation(async (url: string) => {
    if (url.startsWith('/counterparties/similar')) return [similar] as never;
    return { items: [] as CounterpartyListItem[], nextCursor: null } as never;
  });
}

function renderCombobox() {
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CounterpartyCombobox value={null} onChange={onChange} ariaLabel="Корреспондент" />
    </QueryClientProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Корреспондент' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Галургея' } });
  return { input, onChange };
}

describe('CounterpartyCombobox: похожие и права (#460)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await stubApi();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ status: 'unknown', accessToken: null, user: null });
  });

  it('без права crm.create нет «Создать «…»», но есть подсказка и группа «Похожие»', async () => {
    setPermissions([]);
    renderCombobox();

    await waitFor(() => expect(screen.getByText(ui.counterparties.similarTitle)).toBeTruthy());
    expect(screen.getByText('ООО «Галургея»')).toBeTruthy();
    expect(screen.queryByText(new RegExp(ui.counterparties.createInline))).toBeNull();
    expect(screen.getByText(ui.counterparties.noCreatePermission)).toBeTruthy();
  });

  it('с правом crm.create — строка «Создать «…»» на месте', async () => {
    setPermissions([Permission.CRM_CREATE]);
    renderCombobox();

    await waitFor(() =>
      expect(screen.getByText(new RegExp(ui.counterparties.createInline))).toBeTruthy(),
    );
    expect(screen.queryByText(ui.counterparties.noCreatePermission)).toBeNull();
  });

  it('выбор существующего отдаёт ссылку {id, name} и закрывает панель', async () => {
    setPermissions([]);
    const { api } = await import('../api-client.js');
    vi.mocked(api).mockImplementation(async (url: string) => {
      if (url.startsWith('/counterparties/similar')) return [] as never;
      return { items: [existing], nextCursor: null } as never;
    });
    const { onChange } = renderCombobox();

    const option = await screen.findByText(existing.shortName);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith({ id: existing.id, name: existing.shortName });
  });
});
