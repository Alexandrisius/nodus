// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { toast } from 'sonner';

import {
  rolePermissionKey,
  rolesKeys,
  usePendingRolePermissions,
  useToggleRolePermission,
} from './roles.js';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * Оптимистичное точечное переключение права (#379, I4): ячейка меняется до
 * ответа сервера; при ошибке откатывается ТОЛЬКО она (соседние мутации не
 * затираются); инвалидация — один раз после последней мутации группы.
 * Детерминированно — контролируемые deferred вместо ожиданий по времени.
 */

const server = setupServer();

const makeRole = (overrides: Partial<Role> = {}): Role => ({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'head',
  name: 'Руководитель',
  description: 'Руководитель подразделения',
  isSystem: true,
  permissions: [],
  ...overrides,
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const listUrl = '/api/v1/directory/roles';
const permissionUrl = '/api/v1/directory/roles/:id/permissions/:permission';

describe('useToggleRolePermission: оптимистичность (#379)', () => {
  it('ячейка меняется до ответа сервера и подтверждается DTO', async () => {
    const role = makeRole();
    const pending = deferred<Role>();
    server.use(
      http.get(listUrl, () => HttpResponse.json([role])),
      http.put(permissionUrl, () => pending.promise.then((data) => HttpResponse.json(data))),
    );
    server.listen({ onUnhandledRequest: 'error' });

    const client = makeClient();
    client.setQueryData<Role[]>(rolesKeys.list(), [role]);
    const { result } = renderHook(() => useToggleRolePermission(), {
      wrapper: wrapperFor(client),
    });

    result.current.mutate({
      roleId: role.id,
      permission: Permission.WORKFLOW_MANAGE,
      granted: true,
    });

    // До ответа сервера в кэше уже новое значение (I4).
    await waitFor(() =>
      expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).toContain(
        Permission.WORKFLOW_MANAGE,
      ),
    );
    expect(result.current.isPending).toBe(true);

    pending.resolve({ ...role, permissions: [Permission.WORKFLOW_MANAGE] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).toEqual([
      Permission.WORKFLOW_MANAGE,
    ]);
    server.close();
  });

  it('две параллельные ячейки: падение первой откатывает только её', async () => {
    const role = makeRole();
    const workflow = deferred<Response>();
    const dictionary = deferred<Role>();
    server.use(
      http.get(listUrl, () => HttpResponse.json([role])),
      http.put(permissionUrl, ({ params }) =>
        params.permission === Permission.WORKFLOW_MANAGE
          ? workflow.promise
          : dictionary.promise.then((data) => HttpResponse.json(data)),
      ),
    );
    server.listen({ onUnhandledRequest: 'error' });

    const client = makeClient();
    client.setQueryData<Role[]>(rolesKeys.list(), [role]);
    const { result } = renderHook(() => useToggleRolePermission(), {
      wrapper: wrapperFor(client),
    });

    act(() => {
      result.current.mutate({
        roleId: role.id,
        permission: Permission.WORKFLOW_MANAGE,
        granted: true,
      });
    });
    act(() => {
      result.current.mutate({
        roleId: role.id,
        permission: Permission.DICTIONARY_MANAGE,
        granted: true,
      });
    });

    await waitFor(() =>
      expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).toEqual(
        expect.arrayContaining([Permission.WORKFLOW_MANAGE, Permission.DICTIONARY_MANAGE]),
      ),
    );

    workflow.resolve(
      HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'boom' }, { status: 500 }),
    );
    await waitFor(() =>
      expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).not.toContain(
        Permission.WORKFLOW_MANAGE,
      ),
    );
    // Вторая ячейка не тронута откатом первой и ещё оптимистична.
    expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).toContain(
      Permission.DICTIONARY_MANAGE,
    );

    dictionary.resolve({ ...role, permissions: [Permission.DICTIONARY_MANAGE] });
    await waitFor(() =>
      expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).toEqual([
        Permission.DICTIONARY_MANAGE,
      ]),
    );
    server.close();
  });

  it('инвалидация — один раз, после последней мутации группы', async () => {
    const role = makeRole();
    const first = deferred<Role>();
    const second = deferred<Role>();
    server.use(
      http.get(listUrl, () => HttpResponse.json([role])),
      http.put(permissionUrl, ({ params }) =>
        (params.permission === Permission.WORKFLOW_MANAGE ? first : second).promise.then((data) =>
          HttpResponse.json(data),
        ),
      ),
    );
    server.listen({ onUnhandledRequest: 'error' });

    const client = makeClient();
    client.setQueryData<Role[]>(rolesKeys.list(), [role]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useToggleRolePermission(), {
      wrapper: wrapperFor(client),
    });

    act(() => {
      result.current.mutate({
        roleId: role.id,
        permission: Permission.WORKFLOW_MANAGE,
        granted: true,
      });
    });
    act(() => {
      result.current.mutate({
        roleId: role.id,
        permission: Permission.DICTIONARY_MANAGE,
        granted: true,
      });
    });

    first.resolve({ ...role, permissions: [Permission.WORKFLOW_MANAGE] });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(0));

    second.resolve({
      ...role,
      permissions: [Permission.WORKFLOW_MANAGE, Permission.DICTIONARY_MANAGE],
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    server.close();
  });

  it('404: тост «роль не найдена» и перезапрос списка', async () => {
    const role = makeRole();
    server.use(
      http.get(listUrl, () => HttpResponse.json([role])),
      http.put(permissionUrl, () =>
        HttpResponse.json({ code: 'NOT_FOUND', message: 'Role not found' }, { status: 404 }),
      ),
    );
    server.listen({ onUnhandledRequest: 'error' });

    const client = makeClient();
    client.setQueryData<Role[]>(rolesKeys.list(), [role]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useToggleRolePermission(), {
      wrapper: wrapperFor(client),
    });

    result.current.mutate({
      roleId: role.id,
      permission: Permission.WORKFLOW_MANAGE,
      granted: true,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith(ui.access.roleGone);
    expect(invalidate).toHaveBeenCalled();
    // Откат: права в кэше прежние.
    expect(client.getQueryData<Role[]>(rolesKeys.list())?.[0]?.permissions).toEqual([]);
    server.close();
  });

  it('пока запрос в полёте, ячейка есть в usePendingRolePermissions', async () => {
    const role = makeRole();
    const pending = deferred<Role>();
    server.use(
      http.get(listUrl, () => HttpResponse.json([role])),
      http.put(permissionUrl, () => pending.promise.then((data) => HttpResponse.json(data))),
    );
    server.listen({ onUnhandledRequest: 'error' });

    const client = makeClient();
    client.setQueryData<Role[]>(rolesKeys.list(), [role]);
    const { result } = renderHook(
      () => ({ toggle: useToggleRolePermission(), pending: usePendingRolePermissions() }),
      { wrapper: wrapperFor(client) },
    );

    result.current.toggle.mutate({
      roleId: role.id,
      permission: Permission.WORKFLOW_MANAGE,
      granted: true,
    });

    await waitFor(() =>
      expect(
        result.current.pending.has(rolePermissionKey(role.id, Permission.WORKFLOW_MANAGE)),
      ).toBe(true),
    );

    pending.resolve({ ...role, permissions: [Permission.WORKFLOW_MANAGE] });
    await waitFor(() => expect(result.current.pending.size).toBe(0));
    server.close();
  });
});
