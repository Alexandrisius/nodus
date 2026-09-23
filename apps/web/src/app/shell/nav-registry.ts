import {
  Building2,
  FolderOpen,
  House,
  ListTodo,
  Mail,
  MessageSquare,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ui } from '@nodus/contracts';

/** Вкладка модуля топбара (подмодуль): search-параметр + предикат активности. */
export interface NavTabDef {
  id: string;
  label: string;
  search: Record<string, string>;
  isActive: (search: URLSearchParams) => boolean;
}

/** Модуль левой рейки: id — ключ персонализации порядка (UiPreferences). */
export interface NavModuleDef {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  /** Активен по точному совпадению пути (Главная) или по префиксу. */
  exact?: boolean;
  /** Источник счётчика-значка (считается в рейке по живым данным). */
  badge?: 'tasks' | 'letters' | 'chat';
  tabs: NavTabDef[];
}

/**
 * ЕДИНЫЙ реестр навигации портала (концепт «Персональный порядок», #4):
 * и левая рейка, и топбар читают модули и вкладки ОТСЮДА — раньше списки
 * жили разрозненно в node-rail.tsx и top-bar.tsx. Порядок в массиве —
 * СИСТЕМНЫЙ дефолт (нижний слой разрешения: личный ?? общий ?? системный).
 * Точка расширения (I13): после MVP реестр сможет приходить манифестом
 * от бэкенда (фичефлаги модулей, I10) — замена в одном месте.
 * Главная — модуль с каноническим адресом '/home': корень '/' — стартовая
 * переадресация на ПЕРВЫЙ модуль личного порядка (best practice: каноничный
 * URL у каждого раздела, redirect на корне — иначе сдвинутая с первого
 * места Главная стала бы недостижимой; подтверждено research, gotchas).
 */
export const NAV_MODULES: NavModuleDef[] = [
  { id: 'home', to: '/home', label: ui.nav.home, icon: House, exact: true, tabs: [] },
  {
    id: 'tasks',
    to: '/tasks',
    label: ui.nav.tasks,
    icon: ListTodo,
    badge: 'tasks',
    tabs: [
      {
        id: 'kanban',
        label: ui.tasks.viewKanban,
        search: { view: 'kanban' },
        isActive: (s) => (s.get('view') ?? 'kanban') === 'kanban',
      },
      {
        id: 'list',
        label: ui.tasks.viewList,
        search: { view: 'list' },
        isActive: (s) => s.get('view') === 'list',
      },
    ],
  },
  {
    id: 'letters',
    to: '/letters',
    label: ui.nav.letters,
    icon: Mail,
    badge: 'letters',
    // Папки почты + журнал документов (модель v2, вердикты 22.09.2026):
    // «Незарегистрированные» — НЕ папка, а пресет-фильтр «К регистрации»
    // во «Входящих»; журнал — реестр только документов (Вх/Исх).
    tabs: [
      {
        id: 'incoming',
        label: ui.letters.folderIncoming,
        search: { folder: 'incoming' },
        isActive: (s) => (s.get('folder') ?? 'incoming') === 'incoming',
      },
      {
        id: 'outgoing',
        label: ui.letters.folderOutgoing,
        search: { folder: 'outgoing' },
        isActive: (s) => s.get('folder') === 'outgoing',
      },
      {
        id: 'registry',
        label: ui.letters.folderRegistry,
        search: { folder: 'registry' },
        isActive: (s) => s.get('folder') === 'registry',
      },
    ],
  },
  {
    id: 'crm',
    to: '/crm',
    label: ui.nav.crm,
    icon: Building2,
    // Дом master-данных внешних организаций (#83, вердикт владельца 23.09):
    // рейка без зоопарка — сегодня одна вкладка, договоры и тендеры нарастут
    // вкладками по вхождению тендерно-договорного контура в план (V2).
    tabs: [
      {
        id: 'counterparties',
        label: ui.nav.counterparties,
        search: {},
        isActive: () => true,
      },
    ],
  },
  {
    id: 'projects',
    to: '/projects',
    label: ui.nav.projects,
    icon: FolderOpen,
    tabs: [{ id: 'list', label: ui.projects.viewList, search: {}, isActive: () => true }],
  },
  {
    id: 'chat',
    to: '/chat',
    label: ui.nav.chat,
    icon: MessageSquare,
    badge: 'chat',
    tabs: [
      {
        id: 'chats',
        label: ui.chat.tabChats,
        search: {},
        isActive: (s) => {
          const tab = s.get('tab');
          return tab !== 'tasks' && tab !== 'settings';
        },
      },
      {
        id: 'tasks',
        label: ui.chat.tabTaskChats,
        search: { tab: 'tasks' },
        isActive: (s) => s.get('tab') === 'tasks',
      },
      {
        id: 'settings',
        label: ui.chat.tabSettings,
        search: { tab: 'settings' },
        isActive: (s) => s.get('tab') === 'settings',
      },
    ],
  },
  {
    id: 'employees',
    to: '/employees',
    label: ui.nav.employees,
    icon: Users,
    tabs: [
      // #84: «Подразделения» (дерево + панель) — дефолт вместо графа людей:
      // сотни карточек сотрудников непросматриваемы (вердикт владельца 23.09).
      {
        id: 'divisions',
        label: ui.employees.viewDivisions,
        search: {},
        isActive: (s) => (s.get('view') ?? 'divisions') === 'divisions',
      },
      {
        id: 'subordination',
        label: ui.employees.viewSubordination,
        search: { view: 'subordination' },
        isActive: (s) => s.get('view') === 'subordination',
      },
      {
        id: 'list',
        label: ui.employees.viewList,
        search: { view: 'list' },
        isActive: (s) => s.get('view') === 'list',
      },
    ],
  },
];

/** Модуль по pathname (префикс маршрута; Главная — точное совпадение). */
export function navModuleForPath(pathname: string): NavModuleDef | undefined {
  return NAV_MODULES.find((m) => (m.exact ? pathname === m.to : pathname.startsWith(m.to)));
}
