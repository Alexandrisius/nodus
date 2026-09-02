import { Lock, Users } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Badge } from '@nodus/ui/components/badge';
import { Separator } from '@nodus/ui/components/separator';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { formatDate } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useProjectDetail } from '../api/projects-api.js';

export function ProjectPanel({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectDetail(projectId);

  if (isLoading || !project) {
    return <Skeleton className="h-full w-full" />;
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{project.code}</Badge>
        <Badge
          variant="secondary"
          className={
            project.myRole === 'manager' ? 'bg-success-soft text-success' : 'bg-info-soft text-info'
          }
        >
          {ui.projects.myRole[project.myRole]}
        </Badge>
        <Badge variant="secondary">
          {project.privacy === 'closed' && <Lock data-icon="inline-start" />}
          {ui.projects.privacy[project.privacy]}
        </Badge>
      </div>

      <h2 className="mt-3 text-xl font-semibold">{project.name}</h2>

      <div className="mt-4 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{ui.projects.myRole.manager}</span>
          {project.manager ? (
            <span className="flex items-center gap-2">
              <PersonAvatar name={project.manager.displayName} className="size-6" />
              {project.manager.displayName}
            </span>
          ) : (
            ui.common.notSet
          )}
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{ui.projects.endDate}</span>
          {project.endDate ? formatDate(project.endDate) : ui.common.noDeadline}
        </div>
      </div>

      <Separator className="my-4" />

      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Users className="size-4" />
        {ui.projects.members} · {project.membersCount}
      </h3>
      <div className="mt-3 flex items-center gap-2">
        {project.membersPreview.map((member) => (
          <PersonAvatar key={member.id} name={member.displayName} className="size-9" />
        ))}
        {project.membersCount > project.membersPreview.length && (
          <span className="text-sm text-muted-foreground">
            +{project.membersCount - project.membersPreview.length}
          </span>
        )}
      </div>
    </div>
  );
}
