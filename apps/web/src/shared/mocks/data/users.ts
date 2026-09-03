import type { AuthUser, PresenceEntry, UserListItem, UserRef } from '@nodus/contracts';

/** Демо-справочник сотрудников (ПассатПроект, 10 человек для концепта). */

const uid = (n: number): string => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const userIds = {
  director: uid(1),
  secretary: uid(2),
  bimLead: uid(3),
  hrLead: uid(4),
  engineer1: uid(5),
  engineer2: uid(6),
  hr: uid(7),
  engineer3: uid(8),
  architect: uid(9),
  bimEngineer: uid(10),
};

function mk(
  n: number,
  displayName: string,
  positionName: string,
  departmentName: string,
  manager: number | null,
): UserListItem {
  const email = `user${n}@passatproekt.by`;
  return {
    id: uid(n),
    displayName,
    status: 'active',
    avatarUrl: null,
    positionName,
    departmentName,
    email,
    managerId: manager === null ? null : uid(manager),
  };
}

export const demoUserListItems: UserListItem[] = [
  mk(1, 'Александр Климович', 'Директор', 'Руководство', null),
  mk(2, 'Екатерина Поломар', 'Секретарь канцелярии', 'Канцелярия', 1),
  mk(3, 'Денис Клевантович', 'Главный специалист BIM', 'BIM-отдел', 1),
  mk(4, 'Алина Воронина', 'Главный специалист', 'Отдел кадров', 1),
  mk(5, 'Артём Маторин', 'Инженер-проектировщик', 'Конструкторский отдел', 3),
  mk(6, 'Ольга Карпович', 'Инженер-проектировщик', 'Конструкторский отдел', 9),
  mk(7, 'Валерия Шайдерова', 'Специалист по кадрам', 'Отдел кадров', 4),
  mk(8, 'Андрей Кураленя', 'Инженер-проектировщик', 'Конструкторский отдел', 9),
  mk(9, 'Полина Винничек', 'Архитектор', 'Архитектурный отдел', 1),
  mk(10, 'Михаил Акулич', 'Инженер-проектировщик', 'BIM-отдел', 3),
];

export function userRef(id: string): UserRef {
  const item = demoUserListItems.find((u) => u.id === id);
  if (!item) throw new Error(`Неизвестный демо-пользователь: ${id}`);
  return { id: item.id, displayName: item.displayName, avatarUrl: item.avatarUrl };
}

const me = demoUserListItems.find((u) => u.id === userIds.director);
if (!me) throw new Error('Демо-справочник: директор не найден');

export const currentAuthUser: AuthUser = {
  id: me.id,
  email: me.email,
  displayName: me.displayName,
  permissions: ['task.create', 'task.update', 'letter.register', 'resolution.issue'],
};

export const demoPresence: PresenceEntry[] = [
  { user: userRef(userIds.bimLead), status: 'online' },
  { user: userRef(userIds.engineer1), status: 'online' },
  { user: userRef(userIds.engineer2), status: 'online' },
  { user: userRef(userIds.architect), status: 'online' },
  { user: userRef(userIds.bimEngineer), status: 'online' },
  { user: userRef(userIds.secretary), status: 'online' },
  { user: userRef(userIds.hrLead), status: 'away' },
  { user: userRef(userIds.hr), status: 'offline' },
];
