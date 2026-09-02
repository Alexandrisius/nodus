import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, Permission, type AuthUser } from '@nodus/contracts';

import { DomainException } from '../errors/domain-exception.js';
import { PermissionGuard } from './permission.guard.js';

const USER: AuthUser = {
  id: crypto.randomUUID(),
  email: 'ivanov@nodus.by',
  displayName: 'Иванов И.И.',
  permissions: [Permission.TASK_CREATE],
};

function createContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function createGuard(metadata: Record<string, unknown>) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    (key: unknown) => metadata[key as string],
  );
  return new PermissionGuard(reflector);
}

describe('PermissionGuard', () => {
  it('маршрут без метаданных прав пропускается', () => {
    expect(createGuard({}).canActivate(createContext())).toBe(true);
  });

  it('@Public пропускается даже с правами на маршруте', () => {
    const guard = createGuard({
      'nodus:permissions': [Permission.TASK_CREATE],
      'nodus:public': true,
    });
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('без пользователя → UNAUTHENTICATED', () => {
    const guard = createGuard({ 'nodus:permissions': [Permission.TASK_CREATE] });
    try {
      guard.canActivate(createContext());
      expect.unreachable();
    } catch (error) {
      expect((error as DomainException).code).toBe(ErrorCode.UNAUTHENTICATED);
    }
  });

  it('без нужного права → FORBIDDEN', () => {
    const guard = createGuard({ 'nodus:permissions': [Permission.CORE_ADMIN] });
    try {
      guard.canActivate(createContext(USER));
      expect.unreachable();
    } catch (error) {
      expect((error as DomainException).code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it('с нужным правом → пропускается', () => {
    const guard = createGuard({ 'nodus:permissions': [Permission.TASK_CREATE] });
    expect(guard.canActivate(createContext(USER))).toBe(true);
  });
});
