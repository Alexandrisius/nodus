import type { AuthUser, PresenceEntry, UserListItem, UserRef } from '@nodus/contracts';

/** Демо-справочник сотрудников (ПассатПроект, 10 человек для концепта). */

const uid = (n: number): string => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const userIds = {
  klimovich: uid(1),
  polomar: uid(2),
  klevantovich: uid(3),
  voronina: uid(4),
  matorin: uid(5),
  karpovich: uid(6),
  shaiderova: uid(7),
  kuralenya: uid(8),
  vinnichek: uid(9),
  akulich: uid(10),
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
  mk(1, 'Александр Климович', 'БИМ-менеджер', 'BIM-отдел', 7),
  mk(2, 'Екатерина Поломар', 'Инженер-проектировщик', 'BIM-отдел', 1),
  mk(3, 'Денис Клевантович', 'Главный специалист BIM', 'BIM-отдел', 1),
  mk(4, 'Алина Воронина', 'Инженер-проектировщик', 'BIM-отдел', 1),
  mk(5, 'Артём Маторин', 'Инженер-проектировщик', 'BIM-отдел', 1),
  mk(6, 'Ольга Карпович', 'Специалист по кадрам', 'Отдел кадров', 7),
  mk(7, 'Валерия Шайдерова', 'Директор', 'Руководство', null),
  mk(8, 'Андрей Кураленя', 'Инженер-проектировщик', 'Архитектурный отдел', 9),
  mk(9, 'Полина Винничек', 'Главный архитектор', 'Архитектурный отдел', 7),
  mk(10, 'Михаил Акулич', 'Инженер-проектировщик', 'Архитектурный отдел', 9),
];

export function userRef(id: string): UserRef {
  const item = demoUserListItems.find((u) => u.id === id);
  if (!item) throw new Error(`Неизвестный демо-пользователь: ${id}`);
  return { id: item.id, displayName: item.displayName, avatarUrl: item.avatarUrl };
}

const me = demoUserListItems.find((u) => u.id === userIds.klimovich);
if (!me) throw new Error('Демо-справочник: текущий пользователь не найден');

export const currentAuthUser: AuthUser = {
  id: me.id,
  email: me.email,
  displayName: me.displayName,
  permissions: ['task.create', 'task.update', 'letter.register', 'resolution.issue'],
};

export const demoPresence: PresenceEntry[] = [
  { user: userRef(userIds.klevantovich), status: 'online' },
  { user: userRef(userIds.matorin), status: 'online' },
  { user: userRef(userIds.karpovich), status: 'online' },
  { user: userRef(userIds.vinnichek), status: 'online' },
  { user: userRef(userIds.akulich), status: 'online' },
  { user: userRef(userIds.polomar), status: 'online' },
  { user: userRef(userIds.voronina), status: 'away' },
  { user: userRef(userIds.shaiderova), status: 'offline' },
];
