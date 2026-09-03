import { Plus } from 'lucide-react';
import { Outlet, useSearch } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { TaskKanban } from '../components/task-kanban.js';
import { TaskList } from '../components/task-list.js';

/** Задачи: виды «Мой план» (канбан) и «Список» — переключаются в топбаре. */
export function TasksPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const view = search.view === 'list' ? 'list' : 'kanban';

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-xl font-semibold text-foreground">{ui.tasks.title}</h1>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          {ui.tasks.create}
        </Button>
      </header>
      <div className="min-h-0 flex-1">{view === 'list' ? <TaskList /> : <TaskKanban />}</div>
      <Outlet />
    </div>
  );
}
