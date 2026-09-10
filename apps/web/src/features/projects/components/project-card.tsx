import { List, Lock, SquareKanban } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useProjectDetail } from '../api/projects-api.js';
import { projectPassportDefs } from '../lib/project-passport.js';
import { projectKanbanCardFields, projectTaskListFields } from '../lib/project-task-fields.js';
import { ProjectCardSkeleton } from './project-card-skeleton.js';
import { ProjectChat } from './project-chat.js';
import { ProjectKanban } from './project-kanban.js';
import { ProjectTaskList } from './project-task-list.js';

type TasksView = 'list' | 'kanban';

const tasksViews: { id: TasksView; label: string; icon: typeof List }[] = [
  { id: 'list', label: ui.projects.viewList, icon: List },
  { id: 'kanban', label: ui.projects.viewKanban, icon: SquareKanban },
];

/** Ширина колонки обсуждения проекта (канал с тредами). */
const CHAT_W = 400;

/**
 * Карточка проекта — полноценная карточка по анатомии карточки задачи
 * (вердикт владельца 2026-09-10, раунд 2): полоса цепочки — само-узел
 * «ПРОЕКТ · код» + чипы стадии и приватности; ЛЕВАЯ зона (@container) —
 * паспорт «О проекте» полями-реестром (НЕ выдвижная панель — её больше нет)
 * + секция «Задачи» с переключателем Список/Канбан и шестерёнкой вида;
 * ПРАВАЯ колонка — канал проекта (лента новостей-тредов, shared/chat),
 * виден ВСЕГДА рядом с полями — отдельной вкладки «Чат» нет. Зона чата —
 * структурный фон с первого кадра раскрытия (fadeContent=false у слайдера).
 */
export function ProjectCard({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectDetail(projectId);
  const [tasksView, setTasksView] = useState<TasksView>('list');
  const openCard = useOpenCard();

  if (isLoading || !project) {
    return <ProjectCardSkeleton />;
  }

  // Само-узел — только «ТИП · КОД» (название один раз, в хроме слайдера).
  const chainNodes: ChainNode[] = [
    { caption: ui.projects.project, ref: project.code, active: true },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Полоса цепочки: бордюр — структура (с первого кадра роста),
          контент — fade */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <DomainChain nodes={chainNodes} />
          </div>
          {project.stageName ? (
            <NodeChip tone="info" className="shrink-0">
              {project.stageName}
            </NodeChip>
          ) : null}
          <NodeChip tone="muted" className="shrink-0">
            {project.privacy === 'closed' ? <Lock className="size-3" /> : null}
            {ui.projects.privacy[project.privacy]}
          </NodeChip>
        </div>
      </div>

      {/* Левая зона (паспорт + задачи) и правая колонка обсуждения —
          анатомия карточки задачи: вертикальная граница — структурная. */}
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0,1fr) ${CHAT_W}px` }}
      >
        <div className="flex min-h-0 flex-col border-r border-border @container">
          {/* Паспорт проекта (поля-реестр, видимость — «+ Поле») */}
          <div className="content-fade shrink-0 px-5 pt-4 pb-2">
            <EntityFields
              defs={projectPassportDefs(project, openCard)}
              storageKey="nodus-project-fields-v1"
            />
          </div>

          {/* Секция «Задачи»: метка + переключатель вида + шестерёнка */}
          <div className="content-fade flex shrink-0 items-center gap-1 border-b border-border px-4">
            <NodeLabel label={ui.tasks.title} className="mr-2" />
            {tasksViews.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setTasksView(v.id)}
                aria-current={tasksView === v.id}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-none border-b-2 px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
                  tasksView === v.id
                    ? 'border-port text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground/80',
                )}
              >
                <v.icon className="size-3.5" strokeWidth={1.75} />
                {v.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {tasksView === 'list' ? (
                <ViewSettings viewKey="projects.tasks" defs={projectTaskListFields} />
              ) : null}
              {tasksView === 'kanban' ? (
                <ViewSettings viewKey="projects.kanban" defs={projectKanbanCardFields} />
              ) : null}
            </div>
          </div>

          <div className="content-fade min-h-0 flex-1 overflow-hidden">
            {tasksView === 'list' ? <ProjectTaskList projectId={projectId} /> : null}
            {tasksView === 'kanban' ? <ProjectKanban projectId={projectId} /> : null}
          </div>
        </div>

        {/* Колонка обсуждения (канал проекта): тёмный фон — структура,
            виден с первого кадра роста; fade — только содержимое. */}
        <div className="min-h-0 overflow-hidden bg-background">
          <div className="content-fade h-full">
            <ProjectChat project={project} />
          </div>
        </div>
      </div>
    </div>
  );
}
