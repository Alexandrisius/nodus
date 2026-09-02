import { useQuery } from '@tanstack/react-query';
import type { Paginated, UserListItem } from '@nodus/contracts';

import { api } from '../../shared/api-client.js';
import { useAuthStore } from '../../shared/auth-store.js';

/** Список сотрудников (проверка directory-контракта end-to-end; UI-полировка — M3). */
export function UsersPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { data, isLoading, error } = useQuery({
    queryKey: ['directory', 'users'],
    queryFn: () => api<Paginated<UserListItem>>('/directory/users?limit=50'),
  });

  return (
    <main style={{ maxWidth: 720, margin: '4vh auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 20 }}>Сотрудники</h1>
        <div>
          <span style={{ marginRight: 12 }}>{user?.displayName}</span>
          <button onClick={() => void logout()}>Выйти</button>
        </div>
      </header>
      {isLoading ? <p>Загрузка…</p> : null}
      {error ? <p role="alert">Не удалось загрузить справочник</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {data?.items.map((item) => (
          <li key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
            <strong>{item.displayName}</strong>
            <div style={{ color: '#666', fontSize: 14 }}>
              {[item.positionName, item.departmentName].filter(Boolean).join(' · ') || item.email}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
