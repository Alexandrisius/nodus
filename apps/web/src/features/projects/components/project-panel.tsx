import { Lock, MessageSquare, PanelRight, SquareKanban, List } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { ViewSettings } from '../../../shared/views/view-settings.js';
import { useProjectDetail } from '../api/projects-api.js';
import { projectKanbanCardFields, projectTaskListFields } from '../lib/project-task-fields.js';
import { ProjectAboutDrawer } from './project-about-drawer.js';
import { ProjectChat } from './project-chat.js';
import { ProjectKanban } from './project-kanban.js';
import { ProjectPanelSkeleton } from './project-panel-skeleton.js';
import { ProjectTaskList } from './project-task-list.js';

type View = 'list' | 'kanban' | 'chat';

const views: { id: View; label: string; icon: typeof List }[] = [
  { id: 'list', label: ui.projects.viewList, icon: List },
  { id: 'kanban', label: ui.projects.viewKanban, icon: SquareKanban },
  { id: 'chat', label: ui.projects.viewChat, icon: MessageSquare },
];

/**
 * Карточка проекта (нижний слайдер): полоса цепочки — само-узел
 * «ПРОЕКТ · код» + чипы стадии и приватности + кнопка «О проекте»
 * (вталкивающая колонка справа — пуш-механика карточки задачи, сумма ширин
 * постоянна); ряд моно-вкладок представлений (Список / Канбан / Чат —
 * БЕЗ Ганта: отдельный issue #39, обрубки запрещены) с шестерёнкой
 * активного вида; контент — задачи проекта (те же сущности, плейбук §3.1):
 * список канонической таблицей, канбан на общей оболочке борда
 * (глобальная ось, без CRUD колонок), чат — канал проекта с тредами.
 */
export function ProjectPanel({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectDetail(projectId);
  const [view, setView] = useState<View>('list');
  const [aboutOpen, setAboutOpen] = useState(false);
  // Панель «О проекте» монтируется раз и остаётся: колонка анимируется
  // 0↔360px (плавный пуш контента), состояние не теряется.
  const [aboutMounted, setAboutMounted] = useState(false);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  if (isLoading || !project) {
    return <ProjectPanelSkeleton />;
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
          <button
            type="button"
            onClick={() => {
              setAboutMounted(true);
              setAboutOpen((v) => !v);
            }}
            aria-label={ui.projects.aboutProject}
            title={ui.projects.aboutProject}
            className={cn(
              'shrink-0 rounded-lg p-2 transition-colors hover:bg-accent',
              aboutOpen ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <PanelRight className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Ряд вкладок представлений + шестерёнка активного вида */}
      <div className="content-fade flex shrink-0 items-center gap-1 border-b border-border px-4">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={cn(
              'flex h-10 items-center gap-2 rounded-none border-b-2 px-3 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors',
              view === v.id
                ? 'border-port text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground/80',
            )}
          >
            <v.icon className="size-3.5" strokeWidth={1.75} />
            {v.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {view === 'list' ? (
            <ViewSettings viewKey="projects.tasks" defs={projectTaskListFields} />
          ) : null}
          {view === 'kanban' ? (
            <ViewSettings viewKey="projects.kanban" defs={projectKanbanCardFields} />
          ) : null}
        </div>
      </div>

      {/* Контент + вталкивающая колонка «О проекте» (не оверлей) */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <div className="content-fade min-h-0 overflow-hidden">
          {view === 'list' ? <ProjectTaskList projectId={projectId} /> : null}
          {view === 'kanban' ? <ProjectKanban projectId={projectId} /> : null}
          {view === 'chat' ? <ProjectChat project={project} /> : null}
        </div>
        <div
          className={cn(
            'min-h-0 overflow-hidden transition-[width] duration-200 ease-out',
            aboutOpen ? 'w-[360px]' : 'w-0',
          )}
        >
          {aboutMounted ? <ProjectAboutDrawer project={project} onClose={closeAbout} /> : null}
        </div>
      </div>
    </div>
  );
}
