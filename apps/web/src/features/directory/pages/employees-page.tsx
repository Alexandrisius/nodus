import { useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import type { UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { plural } from '../../../shared/lib/format.js';
import { DataTable } from '../../../shared/views/data-table.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useUsersList } from '../api/directory-api.js';
import { OrgChart } from '../components/org-chart.js';
import { employeeListFields } from '../lib/employee-fields.js';

/**
 * Сотрудники: два вида (вердикт владельца 2026-09-10) — «Структура»
 * (граф оргструктуры по грамматике контура: узлы node-панели, ортогональные
 * рёбра с портами) и «Список» (каноническая таблица shared/views, ключ
 * `employees.list`). Виды — вкладки топбара (search-параметр view).
 * Открытие карточки сотрудника — стек карточек из rect источника.
 */
export function EmployeesPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'org';
  const { data, isLoading } = useUsersList();
  const openCard = useOpenCard();

  const items = useMemo(() => data?.items ?? [], [data]);
  const byId = useMemo(() => new Map(items.map((user) => [user.id, user] as const)), [items]);
  const defs = useMemo(() => employeeListFields(byId), [byId]);

  function openEmployee(user: UserListItem, rowEl: HTMLElement) {
    openCard({ kind: 'employee', id: user.id }, rowEl.getBoundingClientRect());
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-foreground">{ui.employees.title}</h1>
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none">
            <span className="text-foreground tabular-nums">{items.length}</span>{' '}
            {plural(items.length, [
              ui.employees.countOne,
              ui.employees.countFew,
              ui.employees.countMany,
            ])}
          </p>
          {view === 'list' ? <ViewSettings viewKey="employees.list" defs={defs} /> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {view === 'org' ? (
          isLoading ? (
            <div className="flex flex-col items-center gap-6 p-6">
              <Skeleton className="h-14 w-56" />
              <div className="flex gap-4">
                <Skeleton className="h-14 w-56" />
                <Skeleton className="h-14 w-56" />
              </div>
            </div>
          ) : (
            <OrgChart people={items} />
          )
        ) : (
          <DataTable
            viewKey="employees.list"
            defs={defs}
            rows={items}
            rowKey={(user) => user.id}
            isLoading={isLoading}
            onOpenRow={openEmployee}
          />
        )}
      </div>
    </div>
  );
}
