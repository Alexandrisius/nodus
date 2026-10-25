import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { beforeAll, describe, expect, it } from 'vitest';

import { IS_PUBLIC_KEY } from './core/decorators/public.decorator.js';
import { PERMISSIONS_KEY } from './core/decorators/require-permissions.decorator.js';

/**
 * Инвентаризация RBAC (I8, #320, #334): каждый маршрут API — мутирующий и
 * читающий — либо требует право (`@RequirePermissions`), либо публичный
 * (`@Public`), либо стоит в списке ниже с причиной — проверка доступа живёт
 * в сервисе (членство, владение, участие, фильтр видимости). Новый маршрут без решения валит тест: «забыл право»
 * больше не проходит гейты молча (класс находки аудита #317).
 */

const SELF = 'субъект — сам пользователь (свой аккаунт, профиль, настройки, уведомления)';
const CHAT_MEMBERSHIP = 'членство и роль в беседе — матрица прав в сервисе чата';
const OWN_FAVORITES = 'своё «Избранное» — только записи текущего пользователя';
const STICKER_OWNER = 'владелец личного пака; корпоративный — право sticker.manage в сервисе';
const TASK_ACCESS = 'участие в задаче — политика доступа задач в сервисе (по задаче)';
const PERSONAL_PLAN = 'личная схема «Моего плана» — только свои стадии';
const CATALOG = 'общий справочник/каталог для всех сотрудников, без персональных данных (I15)';
const COUNTERPARTIES =
  'общий справочник контрагентов: на него ссылаются письма и проекты, читают все сотрудники; мутации — crm.create/crm.manage (ADR-0033)';
const VISIBLE_STICKERS = 'видимые паки: корпоративные + свои/установленные (фильтр в сервисе)';
const TASK_VISIBILITY =
  'фильтр видимости задач в сервисе (участие, подчинённые по оргструктуре, task.view_all)';
const TASK_VISIBLE_ONE =
  'видимость задачи (visibleRow: участие, оргструктура, task.view_all), чужая — 404';
const TASK_STAGES = 'каталог стадий + счётчики по фильтру видимости задач';
const STICKER_BY_ID =
  'любой неудалённый пак по id — раздача «из чата»; личные паки не секретны (осознанно, findPack)';
const DIRECT_CHAT =
  'find-or-create личной беседы с сотрудником (канон мессенджера): новая — только с действующим, существующая — и с уволенным (история), #343';
const FILE_ACCESS = 'доступ к файлу — resolveAccess (владелец или участник беседы вложения)';
const HOME =
  'витрина Главной: число сотрудников и ближайшие дни рождения (день и месяц, без года — решение владельца #342) — любому вошедшему';

const INTENTIONALLY_WITHOUT_PERMISSION: Record<string, string> = {
  // Чтение (#334)
  'GET /auth/me': SELF,
  'GET /auth/sessions': SELF,
  'GET /notifications': SELF,
  'GET /notifications/summary': SELF,
  'GET /notifications/settings': SELF,
  'GET /notifications/:id/deliveries': SELF,
  'GET /tasks/timer': SELF,
  'GET /workflows/:id':
    'схема маршрута без персональных данных — решение владельца: типы и схемы видят все (#378, #428)',
  'GET /chat/conversations': CHAT_MEMBERSHIP,
  'GET /chat/conversations/unread-summary':
    'сводка непрочитанных ТОЛЬКО своих бесед — та же граница членства, что у списка',
  'POST /chat/conversations/direct/:userId': DIRECT_CHAT,
  'GET /chat/conversations/:id/members': CHAT_MEMBERSHIP,
  'GET /chat/conversations/:id/messages': CHAT_MEMBERSHIP,
  'GET /chat/conversations/:id/messages/lookup': CHAT_MEMBERSHIP,
  'GET /chat/conversations/:id/pins': CHAT_MEMBERSHIP,
  'GET /chat/conversations/:id/threads/state': CHAT_MEMBERSHIP,
  'GET /chat/conversations/:id/attachments': CHAT_MEMBERSHIP,
  'GET /chat/conversations/:id/attachments/counts': CHAT_MEMBERSHIP,
  'GET /chat/conversations/by-task/:taskId': TASK_ACCESS,
  'GET /chat/favorites': OWN_FAVORITES,
  'GET /chat/favorites/labels': OWN_FAVORITES,
  'GET /chat/favorites/sources': OWN_FAVORITES,
  'GET /chat/stickers/packs': VISIBLE_STICKERS,
  'GET /chat/stickers/packs/:id': STICKER_BY_ID,
  'GET /chat/urgent/policy': SELF,
  'GET /dictionaries': CATALOG,
  'GET /counterparties': COUNTERPARTIES,
  'GET /counterparties/similar': COUNTERPARTIES,
  'GET /counterparties/:id': COUNTERPARTIES,
  'GET /dictionaries/:code/items': CATALOG,
  'GET /files/:id/office-session': FILE_ACCESS,
  'GET /files/:id/versions': FILE_ACCESS,
  'GET /home/summary': HOME,
  'GET /tasks': TASK_VISIBILITY,
  'GET /tasks/stages': TASK_STAGES,
  'GET /workflows/types': CATALOG,
  'GET /tasks/:id': TASK_VISIBLE_ONE,
  'GET /tasks/:id/branch': `${TASK_VISIBLE_ONE}; маскировка невидимых узлов ветки — #343`,
  'GET /tasks/:id/relations': TASK_VISIBLE_ONE,
  'GET /tasks/:id/results': TASK_VISIBLE_ONE,
  'GET /tasks/:id/history': TASK_VISIBLE_ONE,
  'GET /tasks/:id/time-entries': TASK_VISIBLE_ONE,
  'GET /tasks/:id/transitions': TASK_VISIBLE_ONE,
  'GET /tasks/personal-stages': PERSONAL_PLAN,
  // Изменения (#320)
  'POST /auth/logout-all': SELF,
  'DELETE /auth/sessions/:id': SELF,
  'POST /auth/change-password': SELF,
  'PATCH /directory/users/me': SELF,
  'POST /directory/users/me/avatar': SELF,
  'DELETE /directory/users/me/avatar': SELF,
  'PATCH /notifications/settings': SELF,
  'POST /notifications/read-by-source': SELF,
  'POST /notifications/:id/read': SELF,
  'POST /chat/conversations': CHAT_MEMBERSHIP,
  'PATCH /chat/conversations/:id': CHAT_MEMBERSHIP,
  'PUT /chat/conversations/:id/draft': CHAT_MEMBERSHIP,
  'PATCH /chat/conversations/:id/info': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/avatar': CHAT_MEMBERSHIP,
  'DELETE /chat/conversations/:id/avatar': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/members': CHAT_MEMBERSHIP,
  'PATCH /chat/conversations/:id/members/:userId': CHAT_MEMBERSHIP,
  'DELETE /chat/conversations/:id/members/:userId': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/read': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/threads/:rootId/watch': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/messages/:messageId/pin': CHAT_MEMBERSHIP,
  'DELETE /chat/conversations/:id/messages/:messageId/pin': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/messages/:messageId/reactions': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/forward': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/messages': CHAT_MEMBERSHIP,
  'PATCH /chat/conversations/:id/messages/:messageId': CHAT_MEMBERSHIP,
  'DELETE /chat/conversations/:id/messages/:messageId': CHAT_MEMBERSHIP,
  'POST /chat/conversations/:id/messages/batch-delete': CHAT_MEMBERSHIP,
  'POST /chat/attachments': CHAT_MEMBERSHIP,
  'DELETE /chat/attachments/:id': CHAT_MEMBERSHIP,
  'POST /chat/favorites': OWN_FAVORITES,
  'PATCH /chat/favorites/:messageId': OWN_FAVORITES,
  'DELETE /chat/favorites/:messageId': OWN_FAVORITES,
  'POST /chat/stickers/packs': STICKER_OWNER,
  'PATCH /chat/stickers/packs/:id': STICKER_OWNER,
  'DELETE /chat/stickers/packs/:id': STICKER_OWNER,
  'POST /chat/stickers/packs/:id/stickers': STICKER_OWNER,
  'DELETE /chat/stickers/stickers/:id': STICKER_OWNER,
  'POST /chat/stickers/packs/:id/install': SELF,
  'DELETE /chat/stickers/packs/:id/install': SELF,
  'POST /tasks/bulk': TASK_ACCESS,
  'PATCH /tasks/:id': TASK_ACCESS,
  'DELETE /tasks/:id': TASK_ACCESS,
  'POST /tasks/:id/participants': TASK_ACCESS,
  'DELETE /tasks/:id/participants/:userId': TASK_ACCESS,
  'POST /tasks/:id/checklist': TASK_ACCESS,
  'PATCH /tasks/:id/checklist/:itemId': TASK_ACCESS,
  'DELETE /tasks/:id/checklist/:itemId': TASK_ACCESS,
  'POST /tasks/:id/relations': TASK_ACCESS,
  'DELETE /tasks/:id/relations/:relationId': TASK_ACCESS,
  'POST /tasks/:id/results': TASK_ACCESS,
  'POST /tasks/:id/transitions/:transitionId': TASK_ACCESS,
  'POST /tasks/:id/type': TASK_ACCESS,
  'POST /tasks/:id/time-entries': TASK_ACCESS,
  'DELETE /tasks/time-entries/:entryId': TASK_ACCESS,
  'POST /tasks/:id/timer/start': TASK_ACCESS,
  'POST /tasks/timer/stop': SELF,
  'POST /tasks/personal-stages': PERSONAL_PLAN,
  'PATCH /tasks/personal-stages/:stageId': PERSONAL_PLAN,
  'DELETE /tasks/personal-stages/:stageId': PERSONAL_PLAN,
};

/** Публичные маршруты (`@Public`: без аутентификации вообще) — любой метод. */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  'GET /health': 'проба живости для docker/мониторинга',
  'GET /health/live': 'проба живости для docker/мониторинга',
  'GET /health/ready': 'проба готовности для docker/мониторинга',
  'POST /auth/login': 'вход — до аутентификации по определению',
  'POST /auth/refresh': 'ротация по httpOnly refresh-cookie (access истёк)',
  'POST /auth/logout': 'отзыв сессии по refresh-cookie (access мог истечь)',
  'GET /desktop/config': 'оболочка читает имя сервера и минимальную версию до входа',
  'GET /files/:id/content': 'подписанная ссылка (HMAC + срок) — доступ проверен при выдаче',
  'GET /files/:id/derivative/:kind':
    'подписанная ссылка (HMAC + срок) — доступ проверен при выдаче',
  'GET /files/office-config': 'параметры движка просмотра без данных пользователя',
  'POST /files/:id/office-callback':
    'вызов ONLYOFFICE DS — отправитель проверяется verifySender (JWT DS)',
};

interface RouteDecision {
  route: string;
  mutating: boolean;
  hasPermission: boolean;
  isPublic: boolean;
}

type Handler = (...args: unknown[]) => unknown;

const SRC = import.meta.dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Методы класса с унаследованными (Nest регистрирует маршруты базового класса). */
function methodNames(proto: object): string[] {
  const names = new Set<string>();
  for (let p: object | null = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) names.add(name);
  }
  return [...names];
}

const joinPath = (...parts: string[]): string =>
  `/${parts.join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');

/** Все маршруты всех контроллеров `src/**` (метаданные декораторов Nest). */
async function allRoutes(): Promise<RouteDecision[]> {
  const routes: RouteDecision[] = [];
  for (const file of sourceFiles(SRC).filter((f) => f.endsWith('.controller.ts'))) {
    const exported = (await import(file)) as Record<string, unknown>;
    for (const controller of Object.values(exported)) {
      if (typeof controller !== 'function') continue;
      const base: unknown = Reflect.getMetadata(PATH_METADATA, controller);
      if (base === undefined) continue;
      // Путь-массив (`@Controller(['a','b'])`) молча выпал бы из инвентаризации.
      if (typeof base !== 'string') throw new Error(`${file}: путь контроллера не строка`);
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of methodNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
        if (typeof method !== 'number') continue;
        const marker = (key: string): unknown =>
          Reflect.getMetadata(key, handler as Handler) ?? Reflect.getMetadata(key, controller);
        const permissions = marker(PERMISSIONS_KEY);
        const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        routes.push({
          route: `${RequestMethod[method]} ${joinPath(base, typeof path === 'string' ? path : '')}`,
          mutating: method !== RequestMethod.GET,
          hasPermission: Array.isArray(permissions) && permissions.length > 0,
          isPublic: marker(IS_PUBLIC_KEY) === true,
        });
      }
    }
  }
  return routes;
}

describe('RBAC-инвентаризация маршрутов (I8, #320, #334)', () => {
  let routes: RouteDecision[];

  // Импорт всех контроллеров (граф модулей api) — секунды под параллельной
  // нагрузкой turbo: один раз на файл и с запасом над дефолтными 5 с.
  beforeAll(async () => {
    routes = await allRoutes();
  }, 60_000);

  // Поиск по тексту `@Controller(`: алиас импорта или обёртка applyDecorators
  // его обойдут — контроллеры объявляются только напрямую (канон patterns.md).
  it('контроллер живёт только в *.controller.ts (иначе ускользнёт от инвентаризации)', () => {
    const misplaced = sourceFiles(SRC).filter(
      (f) => !f.endsWith('.controller.ts') && readFileSync(f, 'utf8').includes('@Controller('),
    );
    expect(misplaced).toEqual([]);
    expect(routes.filter((r) => r.mutating).length).toBeGreaterThan(50);
  });

  it('каждый маршрут — право, @Public или осознанное исключение с причиной', () => {
    const undecided = routes
      .filter((r) => !r.hasPermission && !r.isPublic)
      .filter((r) => !(r.route in INTENTIONALLY_WITHOUT_PERMISSION))
      .map((r) => r.route);
    expect(undecided, 'добавь @RequirePermissions или строку в список с причиной').toEqual([]);
  });

  it('@Public — только из списка с причиной и никогда вместе с правом (guard его не проверит)', () => {
    const publicRoutes = routes.filter((r) => r.isPublic);
    expect(
      publicRoutes.filter((r) => !(r.route in INTENTIONALLY_PUBLIC)).map((r) => r.route),
    ).toEqual([]);
    expect(publicRoutes.filter((r) => r.hasPermission).map((r) => r.route)).toEqual([]);
  });

  it('списки исключений не протухают', () => {
    const unguarded = new Set(
      routes.filter((r) => !r.hasPermission && !r.isPublic).map((r) => r.route),
    );
    const publicSet = new Set(routes.filter((r) => r.isPublic).map((r) => r.route));
    expect(
      Object.keys(INTENTIONALLY_WITHOUT_PERMISSION).filter((r) => !unguarded.has(r)),
      'маршрут удалён или получил право — убери строку',
    ).toEqual([]);
    expect(Object.keys(INTENTIONALLY_PUBLIC).filter((r) => !publicSet.has(r))).toEqual([]);
  });
});
