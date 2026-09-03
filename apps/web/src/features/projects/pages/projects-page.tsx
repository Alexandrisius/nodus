import { Plus } from 'lucide-react';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Badge } from '@nodus/ui/components/badge';
import { Button } from '@nodus/ui/components/button';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useProjectsList } from '../api/projects-api.js';

/** Проекты: список с ролью, участниками и приватностью (референс Битрикса). */
export function ProjectsPage() {
  const { data, isLoading } = useProjectsList();
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-xl font-semibold text-foreground">{ui.projects.title}</h1>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          {ui.projects.create}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="paper-surface overflow-hidden rounded-xl border">
            {(data?.items ?? []).map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() =>
                  void navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
                }
                className="flex w-full items-center gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{project.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {project.stageName} · {ui.projects.activity}:{' '}
                    {formatDateTime(project.activityAt)}
                  </div>
                </div>
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
                <span className="flex shrink-0 items-center">
                  {project.membersPreview.slice(0, 4).map((member) => (
                    <PersonAvatar
                      key={member.id}
                      name={member.displayName}
                      className="-ml-1.5 size-7 first:ml-0"
                    />
                  ))}
                  {project.membersCount > 4 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      +{project.membersCount - 4}
                    </span>
                  )}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {ui.projects.privacy[project.privacy]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Outlet />
    </div>
  );
}
