import { delay, http, HttpResponse } from 'msw';
import type { Role } from '@nodus/contracts';
import { ErrorCode, Permission, SystemRole, permissionSchema, roleSchema } from '@nodus/contracts';
import { z } from 'zod';

import { getMockActor } from '../../mocks/mock-actor.js';
import { DEMO_GONE_ROLE_ID, demoRoles } from '../../mocks/data/roles.js';

/**
 * Моки «Прав доступа» (#379, ADR-0034): список ролей и точечная выдача/отзыв
 * права. Проверки — в порядке сервера (Р3 плана): 400 (пайпы) → 403 (нет
 * `role.manage`) → 404 → 409 (`admin` неизменяем) → 403 (чужое право) →
 * «Временная роль» (её «удалил другой администратор») → 200.
 * Состояние — на уровне модуля: перезагрузка страницы его сбрасывает
 * (gotcha msw-query). Тела ответов проверяются схемами contracts.
 */

let state: Role[] = structuredClone(demoRoles);

/** Сброс демо-ролей (тесты и повторный вход в демо-режим). */
export function resetRoleMocks(): void {
  state = structuredClone(demoRoles);
}

const error = (code: string, message: string, status: number, details?: unknown) =>
  HttpResponse.json({ code, message, ...(details ? { details } : {}) }, { status });

const notFound = () => error(ErrorCode.NOT_FOUND, 'Role not found', 404);

/** Копия роли с одним правом; порядок прав — как у сервера (по алфавиту). */
function withPermission(role: Role, permission: Permission, granted: boolean): Role {
  const rest = role.permissions.filter((item) => item !== permission);
  return { ...role, permissions: granted ? [...rest, permission].sort() : rest };
}

async function toggle(params: Record<string, unknown>, granted: boolean) {
  // 1. Пайпы: id — uuid, право — из каталога (как на сервере — 400).
  if (
    !z.uuid().safeParse(params.id).success ||
    !permissionSchema.safeParse(params.permission).success
  ) {
    return error(ErrorCode.VALIDATION_FAILED, 'Invalid role id or permission', 400);
  }
  const id = String(params.id);
  const permission = permissionSchema.parse(params.permission);
  const actor = getMockActor();

  // 2. Гвард: право управления ролями.
  if (!actor.permissions.includes(Permission.ROLE_MANAGE)) {
    return error(ErrorCode.FORBIDDEN, 'Forbidden', 403);
  }

  // 3. Роль существует.
  const role = state.find((item) => item.id === id);
  if (!role) return notFound();

  // 4. Администратор неизменяем.
  if (role.code === SystemRole.ADMIN) {
    return error(ErrorCode.ROLE_LOCKED, 'Role permissions are locked', 409, {
      roleId: role.id,
      code: role.code,
    });
  }

  // 5. Выдать можно только право, которое есть у самого актора (отзыв — можно любое).
  if (granted && !actor.permissions.includes(permission)) {
    return error(ErrorCode.ROLE_PERMISSION_NOT_HELD, 'Permission is not held by actor', 403, {
      permissions: [permission],
    });
  }

  // 6. «Временная роль»: её удалил другой администратор — изменение не сохранится.
  if (role.id === DEMO_GONE_ROLE_ID) {
    await delay(400);
    state = state.filter((item) => item.id !== DEMO_GONE_ROLE_ID);
    return notFound();
  }

  // 7. Идемпотентно применяем и отдаём свежую роль.
  const updated = withPermission(role, permission, granted);
  state = state.map((item) => (item.id === id ? updated : item));
  return HttpResponse.json(roleSchema.parse(updated));
}

export const rolesHandlers = [
  http.get('/api/v1/directory/roles', () => HttpResponse.json(roleSchema.array().parse(state))),
  http.put('/api/v1/directory/roles/:id/permissions/:permission', ({ params }) =>
    toggle(params, true),
  ),
  http.delete('/api/v1/directory/roles/:id/permissions/:permission', ({ params }) =>
    toggle(params, false),
  ),
];
