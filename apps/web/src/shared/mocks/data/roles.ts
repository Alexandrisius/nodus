import { Permission, type Role } from '@nodus/contracts';

import { demoDepartments } from './departments.js';
import { departmentIds } from './org-ids.js';
import { demoUserListItems, userIds } from './users.js';

/**
 * Демо-роли портала для моков «Прав доступа» (#379, ADR-0034). Форма —
 * `roleSchema` contracts; порядок — как у сервера (системные первыми, далее
 * по дате создания), права внутри роли — по алфавиту (Р8). Состав повторяет
 * сид: администратор, руководитель, сотрудник, модератор + пользовательские.
 */

const rid = (n: number): string => `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const sorted = (...permissions: Permission[]): Permission[] => [...permissions].sort();

type RoleBase = Omit<Role, 'memberCount' | 'departmentCount' | 'preview'>;

const baseRoles: RoleBase[] = [
  {
    id: rid(1),
    code: 'admin',
    name: 'Администратор',
    description: 'Полный доступ к порталу',
    isSystem: true,
    // Секретные проекты и публикация в канал проекта — НЕ в дефолте админа
    // (#52, ADR-0030): надзор — роль «Системный надзор», объявления —
    // руководство проекта/точечная выдача. Зеркало `all-permissions.ts`.
    permissions: sorted(
      ...Object.values(Permission).filter(
        (permission) =>
          permission !== Permission.PROJECT_VIEW_SECRET &&
          permission !== Permission.PROJECT_CHANNEL_POST,
      ),
    ),
  },
  {
    id: rid(2),
    code: 'head',
    name: 'Руководитель',
    description: 'Руководитель подразделения: постановка и назначение задач',
    isSystem: true,
    permissions: sorted(
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
      Permission.TASK_ASSIGN,
      Permission.TASK_CREATE,
    ),
  },
  {
    id: rid(3),
    code: 'employee',
    name: 'Сотрудник',
    description: 'Базовая роль: чтение справочника, работа с задачами',
    isSystem: true,
    permissions: sorted(
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
      Permission.TASK_CREATE,
    ),
  },
  {
    id: rid(4),
    code: 'moderator',
    name: 'Модератор портала',
    description: 'Модерация мессенджера: удаление любых сообщений в группах и каналах',
    isSystem: true,
    permissions: sorted(
      Permission.CHAT_MODERATE,
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
    ),
  },
  // «Канцелярия» — системная (#55, Р13; ADR-0033 доп. п.3): регистрирует
  // письма и ведёт справочник контрагентов.
  {
    id: rid(6),
    code: 'office',
    name: 'Канцелярия',
    description: 'Регистрация писем и справочник контрагентов',
    isSystem: true,
    permissions: sorted(
      Permission.CORRESPONDENCE_REGISTER,
      Permission.CRM_CREATE,
      Permission.CRM_MANAGE,
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
    ),
  },
  {
    id: rid(5),
    code: 'gip',
    name: 'ГИП',
    description: 'Главный инженер проекта: задачи всех участников своего проекта',
    isSystem: false,
    permissions: sorted(
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
      Permission.TASK_ASSIGN,
      Permission.TASK_CREATE,
      Permission.TASK_VIEW_ALL,
    ),
  },
  {
    id: rid(7),
    code: 'bim-coordinator',
    name: 'BIM-координатор',
    description: 'Настройка процессов, атрибутов и справочников',
    isSystem: false,
    permissions: sorted(
      Permission.CUSTOM_FIELD_MANAGE,
      Permission.DICTIONARY_MANAGE,
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
      Permission.TASK_CREATE,
      Permission.WORKFLOW_MANAGE,
    ),
  },
  {
    id: rid(8),
    code: 'temporary',
    name: 'Временная роль',
    description: 'Демо: роль удалил другой администратор — изменение не сохранится',
    isSystem: false,
    permissions: sorted(Permission.DIRECTORY_READ, Permission.PROJECT_CREATE),
  },
  // «Руководство» (#55, Р13): держатели `correspondence.resolve` — первые в
  // списке адресатов при регистрации письма.
  {
    id: rid(9),
    code: 'management',
    name: 'Руководство',
    description: 'Принимают решения по письмам: первые в списке адресатов',
    isSystem: false,
    permissions: sorted(
      Permission.CORRESPONDENCE_RESOLVE,
      Permission.DIRECTORY_READ,
      Permission.PROJECT_CREATE,
    ),
  },
];

/** Роли демо с нулевым составом: счётчики и аватары считает мок-сервер
 *  по `demoRoleMembers` (состав меняется мутациями). */
export const demoRoles: Role[] = baseRoles.map((role) => ({
  ...role,
  memberCount: 0,
  departmentCount: 0,
  preview: [],
}));

/** Начальный состав демо-ролей: сотрудники и подразделения (ADR-0034). */
export const demoRoleMembers: Record<string, { userIds: string[]; departmentIds: string[] }> = {
  [rid(1)]: { userIds: [userIds.shaiderova, userIds.klimovich], departmentIds: [] },
  [rid(2)]: {
    userIds: [userIds.vinnichek, userIds.klevantovich, userIds.polomar],
    departmentIds: [],
  },
  [rid(3)]: { userIds: [], departmentIds: [departmentIds.company] },
  [rid(4)]: { userIds: [userIds.karpovich], departmentIds: [] },
  [rid(5)]: { userIds: [userIds.klevantovich, userIds.voronina], departmentIds: [] },
  [rid(6)]: { userIds: [userIds.karpovich], departmentIds: [departmentIds.admin] },
  [rid(7)]: { userIds: [userIds.klimovich, userIds.matorin], departmentIds: [departmentIds.bim] },
  [rid(8)]: { userIds: [], departmentIds: [] },
  [rid(9)]: { userIds: [userIds.shaiderova, userIds.vinnichek], departmentIds: [] },
};

/** id «Временной роли»: мок удаляет её на первой мутации (гонка с удалением). */
export const DEMO_GONE_ROLE_ID = rid(8);

/** id системных ролей — демо-данные типов процессов ссылаются на них (#432). */
export const demoRoleIds = {
  admin: rid(1),
  head: rid(2),
  employee: rid(3),
  moderator: rid(4),
  gip: rid(5),
  office: rid(6),
  bimCoordinator: rid(7),
  management: rid(9),
} as const;

/** Подразделение и его предки (управленческая структура) — мок серверного
 *  CTE эффективных ролей (#379): роль подразделения-предка действует на
 *  сотрудников вложенных подразделений. */
export function mockDepartmentChain(departmentId: string | null | undefined): string[] {
  const byId = new Map(demoDepartments.map((entry) => [entry.id, entry]));
  const chain: string[] = [];
  let current = departmentId ?? null;
  while (current !== null && !chain.includes(current)) {
    chain.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return chain;
}

/** Эффективные роли сотрудника: прямые + роли подразделения и его предков
 *  (состав ролей — `demoRoleMembers`, меняется мутациями «Прав доступа»). */
export function mockEffectiveRoleIds(userId: string): string[] {
  const user = demoUserListItems.find((entry) => entry.id === userId);
  const chain = mockDepartmentChain(user?.departmentId);
  const result = new Set<string>();
  for (const [roleId, members] of Object.entries(demoRoleMembers)) {
    if (members.userIds.includes(userId)) result.add(roleId);
    if (members.departmentIds.some((id) => chain.includes(id))) result.add(roleId);
  }
  return [...result];
}

/** Права актёра — объединение прав демо-ролей (#432: доступ к типам). */
export function mockPermissionsOfRoleIds(roleIds: readonly string[]): Permission[] {
  const permissions = new Set<Permission>();
  for (const role of demoRoles) {
    if (!roleIds.includes(role.id)) continue;
    for (const permission of role.permissions) permissions.add(permission);
  }
  return [...permissions].sort();
}

/** Среди эффективных ролей есть «Администратор» (Р6: ему можно всё). */
export function mockIsAdmin(userId: string): boolean {
  return mockEffectiveRoleIds(userId).includes(demoRoleIds.admin);
}
