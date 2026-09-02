import 'reflect-metadata';
import { execSync } from 'node:child_process';
import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  apiErrorResponseSchema,
  authTokensSchema,
  authUserSchema,
  departmentNodeSchema,
  ErrorCode,
  paginatedSchema,
  userListItemSchema,
} from '@nodus/contracts';

import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { EventDispatcher } from '../../src/core/events/event-dispatcher.js';
import { ensureTestDatabase } from './test-db.js';

/**
 * Критерии приёмки issue #3 на живом стеке (реальные PG/Redis, nodus_test):
 * логин → refresh-ротация → reuse-detection → logout; RBAC на уровне API (I8);
 * деактивация пользователя отзывает сессии событием directory.user.deactivated.
 */

const ADMIN = { email: 'admin@nodus.by', password: 'Nodus!Admin2026' };
const EMPLOYEE = { email: 'sidorova@nodus.by', password: 'Nodus!Demo2026' };

function cookieOf(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0]!;
}

async function login(baseUrl: string, email: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('auth + directory (integration)', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    const testUrl = await ensureTestDatabase(process.cwd());
    process.env.DATABASE_URL = testUrl;
    // Демо-данные в тестовую БД (идемпотентный seed).
    execSync('pnpm exec prisma db seed', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: 'inherit',
    });

    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.register(fastifyCookie);
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    prisma = app.get(PrismaService);
    // Повторные прогоны на той же БД: сбрасываем статусы после прошлых тестов.
    await prisma.user.updateMany({ data: { status: 'active' } });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('неверный пароль → 401 AUTH_INVALID_CREDENTIALS + аудит login_failed', async () => {
    const res = await login(baseUrl, ADMIN.email, 'wrong-password');
    expect(res.status).toBe(401);
    const body = apiErrorResponseSchema.parse(await res.json());
    expect(body.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.login_failed', details: { path: ['email'], equals: ADMIN.email } },
    });
    expect(audit).not.toBeNull();
  });

  it('запрос без токена → 401 UNAUTHENTICATED (default-deny)', async () => {
    const res = await fetch(`${baseUrl}/directory/users`);
    expect(res.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await res.json()).code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('сотрудник без права directory.manage → 403 FORBIDDEN на мутации (I8)', async () => {
    const res = await login(baseUrl, EMPLOYEE.email, EMPLOYEE.password);
    expect(res.status).toBe(200);
    const { accessToken } = authTokensSchema.parse(await res.json());

    // Чтение справочника разрешено (directory.read у роли employee).
    const list = await fetch(`${baseUrl}/directory/users?limit=5`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.status).toBe(200);

    // Создание пользователя — запрещено.
    const create = await fetch(`${baseUrl}/directory/users`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'hack@nodus.by',
        password: 'Start!23456789',
        lastName: 'Хакер',
        firstName: 'Тест',
      }),
    });
    expect(create.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await create.json()).code).toBe(ErrorCode.FORBIDDEN);
  });

  it('полный цикл: login → me → refresh-ротация → reuse → logout', async () => {
    // login
    const loginRes = await login(baseUrl, ADMIN.email, ADMIN.password);
    expect(loginRes.status).toBe(200);
    const tokens = authTokensSchema.parse(await loginRes.json());
    const cookie = cookieOf(loginRes);
    expect(cookie).toMatch(/^nodus_refresh=/);

    // me
    const me = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.status).toBe(200);
    expect(authUserSchema.parse(await me.json()).email).toBe(ADMIN.email);

    // refresh: ротация выдаёт новый refresh (cookie обязана смениться);
    // access-JWT детерминирован для того же payload в ту же секунду — не сравниваем.
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(refreshRes.status).toBe(200);
    const rotated = authTokensSchema.parse(await refreshRes.json());
    const newCookie = cookieOf(refreshRes);
    expect(rotated.accessToken).toBeTruthy();
    expect(newCookie).not.toBe(cookie);

    // Мгновенное переиспользование СТАРОГО токена = гонка (мультитаб/ретрай):
    // leeway-окно принимает и ротирует штатно — НЕ отзыв.
    const raceRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(raceRes.status).toBe(200);
    const afterRaceCookie = cookieOf(raceRes);

    // Кража: предыдущий токен предъявлен ПОЗЖЕ leeway-окна (симулируем —
    // отматываем updatedAt сессии на минуту назад) → отзыв всей цепочки.
    const sessionId = afterRaceCookie.slice('nodus_refresh='.length).split('.')[0]!;
    await prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });
    const theftRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { cookie: newCookie }, // newCookie — теперь «предыдущий»
    });
    expect(theftRes.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await theftRes.json()).code).toBe(
      ErrorCode.AUTH_SESSION_INVALID,
    );
    const revoked = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(revoked?.revokedAt).not.toBeNull();

    // Вся цепочка мертва, включая последний выданный токен
    const afterRevoke = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { cookie: afterRaceCookie },
    });
    expect(afterRevoke.status).toBe(401);

    // заново login → logout → refresh мёртв
    const relogin = await login(baseUrl, ADMIN.email, ADMIN.password);
    const reloginCookie = cookieOf(relogin);
    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { cookie: reloginCookie },
    });
    expect(logout.status).toBe(204);
    const afterLogout = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { cookie: reloginCookie },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('деактивация пользователя отзывает его сессии событием', async () => {
    // Сессия сотрудника
    const employeeLogin = await login(baseUrl, EMPLOYEE.email, EMPLOYEE.password);
    const employeeCookie = cookieOf(employeeLogin);
    const employeeTokens = authTokensSchema.parse(await employeeLogin.json());

    // Админ деактивирует сотрудника
    const adminLogin = await login(baseUrl, ADMIN.email, ADMIN.password);
    const adminTokens = authTokensSchema.parse(await adminLogin.json());
    const list = await fetch(`${baseUrl}/directory/users?search=Сидорова`, {
      headers: { authorization: `Bearer ${adminTokens.accessToken}` },
    });
    const { items } = paginatedSchema(userListItemSchema).parse(await list.json());
    const target = items.find((u) => u.email === EMPLOYEE.email);
    const deactivate = await fetch(`${baseUrl}/directory/users/${target!.id}/deactivate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminTokens.accessToken}` },
    });
    expect(deactivate.status).toBe(200);

    // Диспетчер доставляет directory.user.deactivated → auth отзывает сессии
    await app.get(EventDispatcher).dispatchPending();

    const refresh = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { cookie: employeeCookie },
    });
    expect(refresh.status).toBe(401);

    // Повторный логин деактивированного — 401
    const reLogin = await login(baseUrl, EMPLOYEE.email, EMPLOYEE.password);
    expect(reLogin.status).toBe(401);

    // /me перечитывает статус из БД → 401 сразу; произвольные защищённые
    // эндпоинты принимали бы access до его TTL (stateless-компромисс, README).
    const meWithOldToken = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${employeeTokens.accessToken}` },
    });
    expect(meWithOldToken.status).toBe(401);
  });

  it('админ видит дерево оргструктуры с руководителями', async () => {
    const adminLogin = await login(baseUrl, ADMIN.email, ADMIN.password);
    const { accessToken } = authTokensSchema.parse(await adminLogin.json());

    const tree = await fetch(`${baseUrl}/directory/departments/tree`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tree.status).toBe(200);
    const roots = z.array(departmentNodeSchema).parse(await tree.json());
    expect(roots).toHaveLength(1);
    expect(roots[0]!.name).toBe('ПассатПроект');
    expect(roots[0]!.headName).toContain('Василевич');
    // BIM-группа вложена в Проектное
    const project = roots[0]!.children.find((c) => c.name === 'Проектное');
    expect(project!.children.map((c) => c.name)).toContain('Группа BIM-технологий');

    // Юридическая структура — отдельным деревом
    const legal = await fetch(`${baseUrl}/directory/departments/tree?kind=legal`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const legalRoots = z.array(departmentNodeSchema).parse(await legal.json());
    expect(legalRoots[0]!.children.map((c) => c.name)).toContain('Группа ГИПов');
  });
});
