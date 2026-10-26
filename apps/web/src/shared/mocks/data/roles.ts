import { Permission, type Role } from '@nodus/contracts';

/**
 * Демо-роли портала для моков «Прав доступа» (#379, ADR-0034). Форма —
 * `roleSchema` contracts; порядок — как у сервера (системные первыми, далее
 * по дате создания), права внутри роли — по алфавиту (Р8). Состав повторяет
 * сид: администратор, руководитель, сотрудник, модератор + пользовательские.
 */

const rid = (n: number): string => `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const sorted = (...permissions: Permission[]): Permission[] => [...permissions].sort();

export const demoRoles: Role[] = [
  {
    id: rid(1),
    code: 'admin',
    name: 'Администратор',
    description: 'Полный доступ к порталу',
    isSystem: true,
    permissions: sorted(...Object.values(Permission)),
  },
  {
    id: rid(2),
    code: 'head',
    name: 'Руководитель',
    description: 'Руководитель подразделения: постановка и назначение задач',
    isSystem: true,
    permissions: sorted(
      Permission.CORRESPONDENCE_CREATE,
      Permission.DIRECTORY_READ,
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
    permissions: sorted(Permission.DIRECTORY_READ, Permission.TASK_CREATE),
  },
  {
    id: rid(4),
    code: 'moderator',
    name: 'Модератор портала',
    description: 'Модерация мессенджера: удаление любых сообщений в группах и каналах',
    isSystem: true,
    permissions: sorted(Permission.CHAT_MODERATE, Permission.DIRECTORY_READ),
  },
  {
    id: rid(5),
    code: 'gip',
    name: 'ГИП',
    description: 'Главный инженер проекта: задачи всех участников своего проекта',
    isSystem: false,
    permissions: sorted(
      Permission.DIRECTORY_READ,
      Permission.TASK_ASSIGN,
      Permission.TASK_CREATE,
      Permission.TASK_VIEW_ALL,
    ),
  },
  {
    id: rid(6),
    code: 'office',
    name: 'Канцелярия',
    description: 'Регистрация и архив писем, справочник контрагентов',
    isSystem: false,
    permissions: sorted(
      Permission.CORRESPONDENCE_ARCHIVE,
      Permission.CORRESPONDENCE_CREATE,
      Permission.CRM_CREATE,
      Permission.CRM_MANAGE,
      Permission.DIRECTORY_READ,
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
    permissions: sorted(Permission.DIRECTORY_READ),
  },
];

/** id «Временной роли»: мок удаляет её на первой мутации (гонка с удалением). */
export const DEMO_GONE_ROLE_ID = rid(8);
