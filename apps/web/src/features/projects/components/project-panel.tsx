import { ChartGantt, List, Lock, MessageSquare, SquareKanban, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Badge } from '@nodus/ui/components/badge';
import { Button } from '@nodus/ui/components/button';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { formatDate } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DeadlineChip } from '../../../shared/ui/deadline-chip.js';
import { useProjectDetail, useProjectTasks } from '../api/projects-api.js';
import { ProjectGantt } from './project-gantt.js';

type View = 'list' | 'kanban' | 'gantt' | 'chat';

const columnTone = (order: number): string => {
  const tones = [
    'bg-slate-500/80 text-white',
    'bg-sky-500/85 text-white',
    'bg-teal-500/85 text-white',
    'bg-amber-500/85 text-white',
    'bg-emerald-500/85 text-white',
    'bg-rose-500/85 text-white',
  ];
  return tones[Math.min(order, tones.length - 1)] ?? 'bg-slate-500/80 text-white';
};

function ProjectKanban({ tasks }: { tasks: TaskListItem[] }) {
  const stages = [...new Map(tasks.map((t) => [t.stage.id, t.stage])).values()].sort(
    (a, b) => a.order - b.order,
  );
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {stages.map((stage) => {
        const cards = tasks.filter((t) => t.stage.id === stage.id);
        return (
          <section key={stage.id} className="flex h-full w-72 shrink-0 flex-col">
            <header
              className={cn(
                'mb-2 flex h-8 items-center justify-between rounded-lg px-3 text-sm font-semibold',
                columnTone(stage.order),
              )}
            >
              {stage.name}
              <span className="text-xs font-normal opacity-70 tabular-nums">{cards.length}</span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
              {cards.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-lg shadow-black/25"
                >
                  <span className="line-clamp-2 text-sm font-medium">{task.title}</span>
                  <DeadlineChip deadline={task.deadline} />
                  {task.assignee && (
                    <PersonAvatar name={task.assignee.displayName} className="size-6" />
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Карточка проекта (нижний слайдер): паспорт + представления задач + чат. */
export function ProjectPanel({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectDetail(projectId);
  const { data: tasks } = useProjectTasks(projectId);
  const [view, setView] = useState<View>('list');
  const navigate = useNavigate();

  if (isLoading || !project) {
    return <Skeleton className="h-full w-full" />;
  }

  const items = tasks?.items ?? [];
  const views: { id: View; label: string; icon: typeof List }[] = [
    { id: 'list', label: ui.projects.viewList, icon: List },
    { id: 'kanban', label: ui.projects.viewKanban, icon: SquareKanban },
    { id: 'gantt', label: ui.projects.viewGantt, icon: ChartGantt },
    { id: 'chat', label: ui.projects.viewChat, icon: MessageSquare },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b bg-card px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{project.code}</Badge>
          {project.stageName && <Badge variant="secondary">{project.stageName}</Badge>}
          <Badge
            variant="secondary"
            className={
              project.myRole === 'manager'
                ? 'bg-success-soft text-success'
                : 'bg-info-soft text-info'
            }
          >
            {ui.projects.myRole[project.myRole]}
          </Badge>
          <Badge variant="secondary">
            {project.privacy === 'closed' && <Lock data-icon="inline-start" />}
            {ui.projects.privacy[project.privacy]}
          </Badge>
          <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" />
            {project.membersCount}
            {project.manager && (
              <>
                ·<PersonAvatar name={project.manager.displayName} className="size-6" />
                {project.manager.displayName}
              </>
            )}
            {project.endDate && (
              <>
                · {ui.projects.endDate}: {formatDate(project.endDate)}
              </>
            )}
          </span>
        </div>
        <h2 className="mt-2 text-xl font-semibold">{project.name}</h2>
        <nav className="mt-3 flex items-center gap-1">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                view === v.id && 'bg-secondary text-secondary-foreground',
              )}
            >
              <v.icon className="size-4" />
              {v.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'list' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="overflow-hidden rounded-xl border bg-card">
              {items.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-4 border-b px-4 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {task.stage.name}
                  </Badge>
                  <span className="w-44 shrink-0">
                    <DeadlineChip deadline={task.deadline} />
                  </span>
                  {task.assignee ? (
                    <PersonAvatar name={task.assignee.displayName} className="size-6" />
                  ) : (
                    <span className="size-6" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {view === 'kanban' && <ProjectKanban tasks={items} />}
        {view === 'gantt' && <ProjectGantt tasks={items} />}
        {view === 'chat' && (
          <div className="flex h-full items-center justify-center">
            {project.channelId ? (
              <Button
                onClick={() =>
                  void navigate({
                    to: '/chat/$conversationId',
                    params: { conversationId: project.channelId ?? '' },
                  })
                }
              >
                <MessageSquare data-icon="inline-start" />
                {ui.projects.openChannel}
              </Button>
            ) : (
              <Empty className="text-foreground">
                <EmptyTitle>{ui.projects.noChannel}</EmptyTitle>
                <EmptyDescription>{ui.chat.channelOfProject}</EmptyDescription>
              </Empty>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
