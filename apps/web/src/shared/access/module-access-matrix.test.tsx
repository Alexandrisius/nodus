// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@nodus/ui/components/tooltip';

import { useAuthStore } from '../auth-store.js';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../api-client.js', () => {
  class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return { api: vi.fn(), ApiError };
});

/**
 * Вкладка «Права доступа» (#379): матрица «право × роль» — правка под
 * администратором, «только просмотр» без `role.manage`, неизменяемый столбец
 * «Администратор», чужое право, скелет загрузки, ошибка с «Повторить».
 */

const adminRole: Role = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: 'admin',
  name: 'Администратор',
  description: null,
  isSystem: true,
  permissions: Object.values(Permission),
  memberCount: 2,
  departmentCount: 0,
  preview: [],
};

const headRole: Role = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  code: 'head',
  name: 'Руководитель',
  description: 'Руководитель подразделения',
  isSystem: true,
  permissions: [Permission.DIRECTORY_READ, Permission.TASK_CREATE],
  memberCount: 0,
  departmentCount: 0,
  preview: [],
};

const ROLES = [headRole, adminRole];

async function setup({
  permissions = [
    Permission.ROLE_MANAGE,
    Permission.WORKFLOW_MANAGE,
    Permission.CUSTOM_FIELD_MANAGE,
  ],
  roles = ROLES,
}: {
  permissions?: Permission[];
  roles?: Role[];
} = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: '99999999-9999-4999-8999-999999999999',
      email: 'admin@nodus.by',
      displayName: 'Администратор Системный',
      permissions,
    },
  });
  const { api } = await import('../api-client.js');
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/directory/roles') return roles;
    if (String(path).startsWith('/directory/departments')) return [];
    return { ...headRole, permissions: [Permission.WORKFLOW_MANAGE] };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { ModuleAccessMatrix } = await import('./module-access-matrix.js');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  render(<ModuleAccessMatrix module="automation" />, { wrapper });
  return { api: vi.mocked(api) };
}

const methodOf = (init: unknown): string | undefined =>
  (init as { method?: string } | undefined)?.method;

/** Права из вызовов `/directory/roles/:id/permissions/:permission` с нужным методом. */
function permissionCalls(
  calls: readonly (readonly unknown[])[],
  method: 'PUT' | 'DELETE',
): string[] {
  return calls
    .filter(([, init]) => methodOf(init) === method)
    .map(([path]) => String(path))
    .filter((path) => path.includes('/permissions/'))
    .map((path) => decodeURIComponent(path.split('/').pop() ?? ''));
}

/** Меню роли открывается с клавиатуры: jsdom не несёт `PointerEvent`,
 *  на который реагирует триггер Radix. */
async function chooseMenuEntry(roleName: string, entry: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `${ui.access.roleMenu}: ${roleName}` }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByText(entry));
}

describe('ModuleAccessMatrix (#379)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom не считает layout: прокрутка к краю таблицы следит за габаритами.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it('под администратором: флажок активен, клик шлёт точечный PUT', async () => {
    const { api } = await setup();
    const checkbox = await screen.findByRole('switch', {
      name: 'Настраивать процессы и маршруты — Руководитель',
    });
    expect(checkbox).not.toHaveProperty('disabled', true);
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `/directory/roles/${headRole.id}/permissions/${Permission.WORKFLOW_MANAGE}`,
        { method: 'PUT' },
      ),
    );
  });

  it('без права «Управлять ролями и правами» — только просмотр и видимая подсказка', async () => {
    await setup({ permissions: [Permission.DIRECTORY_READ] });
    const checkbox = await screen.findByRole('switch', {
      name: 'Настраивать процессы и маршруты — Руководитель',
    });
    expect(checkbox).toHaveProperty('disabled', true);
    expect(screen.getByText(ui.access.readOnlyHint)).toBeTruthy();
    expect(screen.getByText(ui.access.readOnlyBadge)).toBeTruthy();

    const table = screen.getByRole('table', { name: ui.access.tableLabel });
    const describedBy = table.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(ui.access.readOnlyHint);
  });

  it('шапка роли: счётчик состава, «+» создания роли у админа', async () => {
    await setup();
    await screen.findByRole('switch', { name: 'Настраивать процессы и маршруты — Руководитель' });
    expect(screen.getAllByText('2 сотр.').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: ui.access.createRole }).length).toBe(1);
    expect(
      screen.getByRole('button', { name: `${ui.access.membersAdd}: Руководитель` }),
    ).toBeTruthy();
    // Меню роли есть и у «Администратора» (переименовать, скопировать).
    expect(
      screen.getByRole('button', { name: `${ui.access.roleMenu}: Администратор` }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: `${ui.access.roleMenu}: Руководитель` }),
    ).toBeTruthy();
  });

  it('только просмотр: ни создания ролей, ни меню роли', async () => {
    await setup({ permissions: [Permission.DIRECTORY_READ] });
    await screen.findByRole('switch', { name: 'Настраивать процессы и маршруты — Руководитель' });
    expect(screen.queryByRole('button', { name: ui.access.createRole })).toBeNull();
    expect(
      screen.queryByRole('button', { name: `${ui.access.roleMenu}: Руководитель` }),
    ).toBeNull();
  });

  it('столбец «Администратор»: замок в шапке и недоступные флажки', async () => {
    await setup();
    const checkbox = await screen.findByRole('switch', {
      name: 'Настраивать процессы и маршруты — Администратор',
    });
    expect(checkbox).toHaveProperty('disabled', true);
    expect(checkbox.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('button', { name: ui.access.lockedHint })).toBeTruthy();
    // Реальные данные, а не принудительное «всё отмечено»: у администратора
    // право есть — флажок отмечен.
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });

  it('чужое право: неотмеченная ячейка недоступна, своя — доступна', async () => {
    await setup({ permissions: [Permission.ROLE_MANAGE, Permission.WORKFLOW_MANAGE] });
    const foreign = await screen.findByRole('switch', {
      name: 'Управлять атрибутами — Руководитель',
    });
    expect(foreign).toHaveProperty('disabled', true);
    const own = screen.getByRole('switch', {
      name: 'Настраивать процессы и маршруты — Руководитель',
    });
    expect(own).toHaveProperty('disabled', false);
  });

  it('«Открыть доступ ко всем»: только права вкладки и только права актора, без PATCH', async () => {
    // Актёр не имеет «Управлять справочниками» — эта строка вкладки не выдаётся.
    const { api } = await setup();
    await screen.findByRole('switch', { name: 'Настраивать процессы и маршруты — Руководитель' });
    await chooseMenuEntry('Руководитель', ui.access.openAll);

    await waitFor(() => expect(permissionCalls(api.mock.calls, 'PUT')).toHaveLength(2));
    expect(permissionCalls(api.mock.calls, 'PUT').sort()).toEqual(
      [Permission.CUSTOM_FIELD_MANAGE, Permission.WORKFLOW_MANAGE].sort(),
    );
    // Права других разделов не трогаем: PATCH набора целиком веб не вызывает.
    expect(api.mock.calls.some(([, init]) => methodOf(init) === 'PATCH')).toBe(false);
  });

  it('«Закрыть доступ ко всем»: снимает только права вкладки, права других разделов остаются', async () => {
    const withAutomation: Role = {
      ...headRole,
      permissions: [Permission.DIRECTORY_READ, Permission.TASK_CREATE, Permission.WORKFLOW_MANAGE],
    };
    const { api } = await setup({ roles: [withAutomation, adminRole] });
    await screen.findByRole('switch', { name: 'Настраивать процессы и маршруты — Руководитель' });
    await chooseMenuEntry('Руководитель', ui.access.closeAll);

    await waitFor(() => expect(permissionCalls(api.mock.calls, 'DELETE')).toHaveLength(1));
    expect(permissionCalls(api.mock.calls, 'DELETE')).toEqual([Permission.WORKFLOW_MANAGE]);
    expect(api.mock.calls.some(([, init]) => methodOf(init) === 'PATCH')).toBe(false);
  });

  it('состав «Администратора»: только сотрудники, без вкладки подразделений', async () => {
    await setup();
    await screen.findByRole('switch', { name: 'Настраивать процессы и маршруты — Руководитель' });
    fireEvent.click(screen.getByRole('button', { name: `${ui.access.membersAdd}: Администратор` }));

    // Одна поверхность — список сотрудников: переключателя вкладок нет вовсе.
    expect(await screen.findByText(ui.access.membersAdminHint)).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText(ui.access.tabDepartments)).toBeNull();
  });

  it('состав обычной роли: обе вкладки — сотрудники и подразделения', async () => {
    await setup();
    await screen.findByRole('switch', { name: 'Настраивать процессы и маршруты — Руководитель' });
    fireEvent.click(screen.getByRole('button', { name: `${ui.access.membersAdd}: Руководитель` }));

    expect(await screen.findByRole('radio', { name: ui.access.tabUsers })).toBeTruthy();
    expect(screen.getByRole('radio', { name: ui.access.tabDepartments })).toBeTruthy();
    expect(screen.getByText(ui.access.membersHint)).toBeTruthy();
  });

  it('загрузка: строки прав настоящие, вместо флажков — скелеты', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: '99999999-9999-4999-8999-999999999999',
        email: 'admin@nodus.by',
        displayName: 'Администратор Системный',
        permissions: [Permission.ROLE_MANAGE],
      },
    });
    const { api } = await import('../api-client.js');
    vi.mocked(api).mockImplementation(() => new Promise<Role[]>(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { ModuleAccessMatrix } = await import('./module-access-matrix.js');
    render(<ModuleAccessMatrix module="automation" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
      ),
    });

    expect(await screen.findByText('Настраивать процессы и маршруты')).toBeTruthy();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('ошибка загрузки: «Повторить» перезапрашивает роли', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: {
        id: '99999999-9999-4999-8999-999999999999',
        email: 'admin@nodus.by',
        displayName: 'Администратор Системный',
        permissions: [Permission.ROLE_MANAGE],
      },
    });
    const { api, ApiError } = await import('../api-client.js');
    vi.mocked(api).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', 500));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { ModuleAccessMatrix } = await import('./module-access-matrix.js');
    render(<ModuleAccessMatrix module="automation" />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
      ),
    });

    const retry = await screen.findByRole('button', { name: ui.access.retry });
    expect(screen.getByText(ui.access.loadError)).toBeTruthy();
    const before = vi.mocked(api).mock.calls.filter(([path]) => path === '/directory/roles').length;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        vi.mocked(api).mock.calls.filter(([path]) => path === '/directory/roles').length,
      ).toBeGreaterThan(before),
    );
  });
});
