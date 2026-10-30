import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

import { projectNodePath, useProjectStructure } from '../../../shared/api/project-structure.js';
import { useTaskDetail } from '../api/tasks-api.js';

/** Хлебные крошки структуры в шапке карточки задачи (#467): проект → узлы.
 *  Название задачи живёт в панели данных над описанием (вариант владельца),
 *  поэтому шапка показывает место задачи, а не её название. */
export function TaskBreadcrumbs({ taskId }: { taskId: string }) {
  const { data: task } = useTaskDetail(taskId);
  const { data: structure } = useProjectStructure(task?.project?.id);
  if (!task) return null;
  const path = [
    ...(task.project ? [task.project.name] : []),
    ...projectNodePath(structure?.nodes ?? [], task.nodeId),
  ];
  if (path.length === 0) {
    return <span className="font-mono text-sm text-muted-foreground">#{task.number}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      {path.map((part, index) => (
        <Fragment key={`${index}:${part}`}>
          {index > 0 ? (
            <ChevronRight className="size-3.5 shrink-0 opacity-60" strokeWidth={1.75} />
          ) : null}
          <span className="max-w-64 truncate" title={part}>
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
