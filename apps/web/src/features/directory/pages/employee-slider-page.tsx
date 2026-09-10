import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { useShellStore } from '../../../app/shell/shell-store.js';
import { useUsersList } from '../api/directory-api.js';
import { EmployeeCard } from '../components/employee-card.js';

/** Слайдер карточки сотрудника: раскрытие из rect узла графа/строки списка
 *  (shared-element); имя — в хроме рядом с X; закрытие возвращает вид
 *  сотрудников (search-параметр не теряется). */
export function EmployeeSliderPage() {
  const { userId } = useParams({ strict: false }) as { userId: string };
  const navigate = useNavigate();
  const [source] = useState(() => useShellStore.getState().lastSource);
  const { data } = useUsersList();
  const user = data?.items.find((u) => u.id === userId);

  useEffect(() => {
    useShellStore.getState().setLastSource(null);
  }, []);

  return (
    <>
      <SliderPanel
        title={user?.displayName ?? ui.employees.title}
        sourceRect={source ?? undefined}
        onClose={() => void navigate({ to: '/employees', search: (prev) => prev })}
      >
        <EmployeeCard userId={userId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
