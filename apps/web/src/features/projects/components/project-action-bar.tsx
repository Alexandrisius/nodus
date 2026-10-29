import { Archive, CheckCircle2, MoreHorizontal, Pencil, RotateCcw, UserCog } from 'lucide-react';
import { useState } from 'react';
import type { ProjectDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';

import { useJoinProject, useLeaveProject } from '../api/project-member-mutations.js';
import { useProjectStatus } from '../api/project-mutations.js';
import { ProjectArchiveDialog } from './project-archive-dialog.js';
import { ProjectEditDialog } from './project-edit-dialog.js';
import { ProjectTransferDialog } from './project-transfer-dialog.js';

/**
 * Нижний бар левой панели карточки проекта (вердикт владельца 07.11.2026):
 * кнопки живут СНИЗУ карточки в левой части — как в задачах и письмах, а не
 * «в воздухе» сверху. Слева — «Редактировать проект» и меню «⋯» (статусы,
 * передача руководства), рядом — «Присоединиться/Покинуть». Права серверные
 * (I8): UI только не показывает недоступное.
 */
export function ProjectActionBar({ project }: { project: ProjectDetail }) {
  const status = useProjectStatus();
  const join = useJoinProject(project.id);
  const leave = useLeaveProject(project.id);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const management = project.access.canManage;
  const canAct = management || project.access.canTransfer;

  return (
    <div className="flex h-16 w-full items-center gap-2">
      {project.access.canManage ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" strokeWidth={1.75} />
          {ui.projects.editProject}
        </Button>
      ) : null}

      {canAct ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={ui.projects.actionsTitle}
              title={ui.projects.actionsTitle}
              className="text-muted-foreground"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {management && project.status === 'active' ? (
              <DropdownMenuItem
                onClick={() => status.mutate({ id: project.id, status: 'completed' })}
              >
                <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
                {ui.projects.statusComplete}
              </DropdownMenuItem>
            ) : null}
            {management && project.status !== 'archived' ? (
              <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
                <Archive className="size-3.5" strokeWidth={1.75} />
                {ui.projects.statusArchive}
              </DropdownMenuItem>
            ) : null}
            {management && project.status === 'archived' ? (
              <DropdownMenuItem onClick={() => status.mutate({ id: project.id, status: 'active' })}>
                <RotateCcw className="size-3.5" strokeWidth={1.75} />
                {ui.projects.statusReactivate}
              </DropdownMenuItem>
            ) : null}
            {project.access.canTransfer ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                  <UserCog className="size-3.5" strokeWidth={1.75} />
                  {ui.projects.transfer}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {project.access.canJoin ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => join.mutate()}
          disabled={join.isPending}
        >
          {ui.projects.join}
        </Button>
      ) : null}
      {project.access.canLeave ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => leave.mutate()}
          disabled={leave.isPending}
        >
          {ui.projects.leave}
        </Button>
      ) : null}

      <ProjectArchiveDialog
        name={project.name}
        open={archiveOpen}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          status.mutate({ id: project.id, status: 'archived' });
          setArchiveOpen(false);
        }}
      />
      {transferOpen ? (
        <ProjectTransferDialog project={project} onClose={() => setTransferOpen(false)} />
      ) : null}
      {editOpen ? <ProjectEditDialog project={project} onClose={() => setEditOpen(false)} /> : null}
    </div>
  );
}
