import { useMemo, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import type { UserListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DataTable } from '../../../shared/views/data-table.js';
import {
  employeeSearchText,
  useEmployeeFilterDefs,
} from '../../../shared/views/employee-filter-fields.js';
import { ListToolbar } from '../../../shared/views/list-toolbar.js';
import type { ActiveListFilter } from '../../../shared/views/list-filters.js';
import { useFilteredList, useListToolbar } from '../../../shared/views/use-list-toolbar.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useUsersList } from '../api/directory-api.js';
import { InviteDialog } from '../components/invite-dialog.js';
import { OrgChart } from '../components/org-chart.js';
import { employeeListFields } from '../lib/employee-fields.js';
import { makeCardRowMenuItems } from '../../../shared/views/card-row-menu.js';

/**
 * Сотрудники: два вида (вердикт владельца 2026-09-10) — «Структура»
 * (граф оргструктуры по грамматике контура: узлы node-панели, ортогональные
 * рёбра с портами) и «Список» (каноническая таблица shared/views, ключ
 * `directory.employees`; строка инструментов — поиск по людям + фильтр по
 * подразделению/должности с пресетами + шестерёнка). Виды — вкладки топбара
 * (search-параметр view). Открытие карточки сотрудника — стек карточек из
 * rect источника.
 */
export function EmployeesPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'org';
  const { data, isLoading } = useUsersList();
  const openCard = useOpenCard();
  const [inviteOpen, setInviteOpen] = useState(false);
  const toolbar = useListToolbar('directory.employees');
  const filterDefs = useEmployeeFilterDefs();
  const filter = useMemo<ActiveListFilter<UserListItem>>(
    () => ({
      defs: filterDefs,
      state: toolbar.filters,
      query: toolbar.query,
      searchText: employeeSearchText,
    }),
    [filterDefs, toolbar.filters, toolbar.query],
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const rows = useFilteredList(items, filter);
  const byId = useMemo(() => new Map(items.map((user) => [user.id, user] as const)), [items]);
  const defs = useMemo(() => employeeListFields(byId), [byId]);

  function openEmployee(user: UserListItem, rowEl: HTMLElement) {
    openCard({ kind: 'employee', id: user.id }, rowEl.getBoundingClientRect());
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 px-6">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">
          {ui.employees.title}
          <span className="ml-2 align-middle font-mono text-sm font-normal text-muted-foreground tabular-nums">
            {items.length}
          </span>
        </h1>
        {view === 'list' ? (
          <ListToolbar
            className="min-w-0 flex-1 px-0"
            toolbar={toolbar}
            defs={filterDefs}
            left={
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus data-icon="inline-start" />
                {ui.employees.invite}
              </Button>
            }
            right={<ViewSettings viewKey="directory.employees" defs={defs} />}
          />
        ) : (
          <>
            {/* Закон кнопки создания (вердикт 15.09.2026): первый элемент
                строки инструментов слева от поиска; в виде «Структура» поиска
                нет — кнопка сразу после заголовка (та же левая позиция).
                Метка — «Пригласить» (вердикт 15.09.2026: сотрудников
                приглашают, не создают). */}
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus data-icon="inline-start" />
              {ui.employees.invite}
            </Button>
            <span className="flex-1" />
          </>
        )}
      </div>
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
            viewKey="directory.employees"
            defs={defs}
            rows={rows}
            rowKey={(user) => user.id}
            isLoading={isLoading}
            onOpenRow={openEmployee}
            rowMenu={(user) => makeCardRowMenuItems({ kind: 'employee', id: user.id }, openCard)}
          />
        )}
      </div>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
