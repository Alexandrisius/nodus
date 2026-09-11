import { List, Lock, SquareKanban } from 'lucide-react';
import { useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { useChatWidth } from '../../../shared/ui/use-chat-width.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useProjectDetail } from '../api/projects-api.js';
import { projectPassportDefs } from '../lib/project-passport.js';
import { ProjectCardSkeleton } from './project-card-skeleton.js';
import { ProjectChat } from './project-chat.js';
import { ProjectFlow } from './project-flow.js';
import { ProjectGantt } from './project-gantt.js';
import { ProjectKanban, projectKanbanCardFields } from './project-kanban.js';
import { ProjectReport } from './project-report.js';
import { ProjectTaskList, projectTaskTableFields } from './project-task-list.js';

type ProjectTab = 'tasks' | 'gantt' | 'report' | 'flow' | 'about';
type TasksView = 'list' | 'kanban';

const tasksViews: { id: TasksView; label: string; icon: typeof List }[] = [
  { id: 'list', label: ui.projects.viewList, icon: List },
  { id: 'kanban', label: ui.projects.viewKanban, icon: SquareKanban },
];

const projectTabs: { id: ProjectTab; label: string }[] = [
  { id: 'tasks', label: ui.tasks.title },
  { id: 'gantt', label: ui.projects.tabGantt },
  { id: 'report', label: ui.projects.tabReport },
  { id: 'flow', label: ui.projects.tabFlow },
  { id: 'about', label: ui.projects.aboutProject },
];

/**
 * Карточка проекта — анатомия карточки задачи (вердикт владельца 2026-09-11,
 * раунд 3): мини-граф цепочки убран, горизонтальных зон «поля над задачами»
 * больше нет — ЛЕВАЯ зона = вкладки на всю высоту: **Задачи** (главная,
 * Список/Канбан с шестерёнкой), **Гант**, **Отчёт**, **Схема** (витрины
 * будущих модулей), **О проекте** (паспорт полями-реестром). Чипы стадии и
 * приватности живут в таб-баре справа. ПРАВАЯ колонка — канал проекта,
 * виден всегда; перегородка тянется с памятью (общая на все карточки),
 * панель беседы — из shared/chat. Зона чата — структурный фон с первого
 * кадра раскрытия (fadeContent=false у слайдера).
 */
export function ProjectCard({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectDetail(projectId);
  const [tab, setTab] = useState<ProjectTab>('tasks');
  const [tasksView, setTasksView] = useState<TasksView>('list');
  const openCard = useOpenCard();
  const chatRef = useRef<HTMLDivElement>(null);
  const { chatW, onDividerDown, dragging } = useChatWidth(chatRef);

  if (isLoading || !project) {
    return <ProjectCardSkeleton chatW={chatW} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Левая зона (вкладки) и правая колонка обсуждения — вертикальная
          граница структурная (анатомия карточки задачи). */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <div className="relative flex min-h-0 flex-col border-r border-border @container">
          {/* Таб-бар: вкладки слева; справа — вид задач (на вкладке «Задачи»),
              шестерёнка и чипы стадии/приватности проекта */}
          <div className="content-fade flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4">
            {projectTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 rounded-none border-b-2 px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
                  tab === t.id
                    ? 'border-port text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground/80',
                )}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {tab === 'tasks' ? (
                <>
                  <div className="flex items-center rounded-lg border border-border p-0.5">
                    {tasksViews.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setTasksView(v.id)}
                        aria-pressed={tasksView === v.id}
                        title={v.label}
                        aria-label={v.label}
                        className={cn(
                          'flex size-6 items-center justify-center rounded-md transition-colors',
                          tasksView === v.id
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground/80',
                        )}
                      >
                        <v.icon className="size-3.5" strokeWidth={1.75} />
                      </button>
                    ))}
                  </div>
                  <ViewSettings
                    viewKey={tasksView === 'list' ? 'projects.tasks' : 'projects.kanban'}
                    defs={tasksView === 'list' ? projectTaskTableFields : projectKanbanCardFields}
                  />
                </>
              ) : null}
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

          <div className="content-fade min-h-0 flex-1 overflow-hidden">
            {tab === 'tasks' ? (
              tasksView === 'list' ? (
                <ProjectTaskList projectId={projectId} />
              ) : (
                <ProjectKanban projectId={projectId} />
              )
            ) : null}
            {tab === 'gantt' ? <ProjectGantt projectId={projectId} /> : null}
            {tab === 'report' ? <ProjectReport projectId={projectId} /> : null}
            {tab === 'flow' ? <ProjectFlow projectId={projectId} /> : null}
            {tab === 'about' ? (
              <div className="h-full overflow-y-auto p-6">
                <div className="mx-auto w-full max-w-4xl">
                  <EntityFields
                    defs={projectPassportDefs(project, openCard)}
                    storageKey="nodus-project-fields-v1"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Ручка ресайза чата: невидимый оверлей ПОВЕРХ структурной границы
              (канон карточки задачи, память общая на все карточки) */}
          <div
            onPointerDown={onDividerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label={ui.common.resizePanel}
            title={ui.common.resizePanel}
            className="group absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        {/* Колонка обсуждения (канал проекта): фон — структура с первого
            кадра роста; fade — только содержимое. */}
        <div
          ref={chatRef}
          className={cn('min-h-0 overflow-hidden', !dragging && 'transition-[width] duration-200')}
          style={{ width: chatW }}
        >
          <div className="h-full w-full bg-background">
            <div className="content-fade h-full">
              <ProjectChat project={project} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
