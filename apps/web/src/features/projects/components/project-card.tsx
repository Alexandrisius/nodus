import { useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import {
  ChatPanelToggle,
  ChatSidePanel,
  MIN_COLUMN_WITH_PANEL,
  useChatSidePanel,
} from '../../../shared/chat/chat-side-panel.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { useChatWidth } from '../../../shared/ui/use-chat-width.js';
import { useProjectDetail } from '../api/projects-api.js';
import { projectPassportDefs } from '../lib/project-passport.js';
import { ProjectCardSkeleton } from './project-card-skeleton.js';
import { ProjectChat } from './project-chat.js';
import { ProjectFlow } from './project-flow.js';
import { ProjectGantt } from './project-gantt.js';
import { ProjectReport } from './project-report.js';
import { ProjectTasksTab } from './project-tasks-tab.js';

type ProjectTab = 'tasks' | 'gantt' | 'report' | 'flow' | 'about';

const projectTabs: { id: ProjectTab; label: string }[] = [
  { id: 'tasks', label: ui.tasks.title },
  { id: 'gantt', label: ui.projects.tabGantt },
  { id: 'report', label: ui.projects.tabReport },
  { id: 'flow', label: ui.projects.tabFlow },
  { id: 'about', label: ui.projects.aboutProject },
];

/**
 * Карточка проекта — анатомия карточки задачи (вердикт владельца 2026-09-11,
 * раунд 3+4): мини-граф цепочки убран, горизонтальных зон «поля над задачами»
 * нет — ЛЕВАЯ зона = вкладки на всю высоту: **Задачи** (главная: строка
 * инструментов Список/Канбан + локальный поиск + фильтр + шестерёнка — в
 * зоне задач, не в таб-баре), **Гант**, **Отчёт**, **Схема** (витрины),
 * **О проекте** (паспорт полями-реестром; приватность — полем здесь, чипов
 * стадии/приватности в таб-баре НЕТ). Таб-бар — только вкладки. ПРАВАЯ
 * колонка — канал проекта, ПОЛНОВЫСОТНЫЙ сиблинг (закон одного прохода,
 * вердикт 15.09.2026): окно треда поднимается до верха карточки, его бар —
 * на линии таб-бара; бар ленты канала несёт тоггл панели беседы на правом
 * краю ЛЕНТЫ (закон мессенджера). Перегородка чата тянется с памятью (общая
 * на все карточки), панель беседы — из shared/chat. Зона чата — структурный
 * фон с первого кадра раскрытия (fadeContent=false у слайдера).
 */
export function ProjectCard({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProjectDetail(projectId);
  const [tab, setTab] = useState<ProjectTab>('tasks');
  const openCard = useOpenCard();
  // Панель беседы (закон чата): тоггл — в баре ленты канала на правом краю
  // ЛЕНТЫ (закон мессенджера — шапки с названием у самого чата НЕТ);
  // панель — внутри колонки чата (анимируется ОДНА ширина — левая зона не
  // дёргается); лента не уже 360 при открытой панели.
  const panel = useChatSidePanel();
  // Открытый тред канала — состояние карточки: область панели беседы
  // («Этот тред») и ChannelView читают его из одного места (#42).
  const [threadId, setThreadId] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const { chatW, onDividerDown, dragging } = useChatWidth(
    chatRef,
    0,
    panel.open ? MIN_COLUMN_WITH_PANEL : undefined,
  );
  const columnW = panel.open ? Math.max(chatW, MIN_COLUMN_WITH_PANEL) : chatW;

  if (isLoading || !project) {
    return <ProjectCardSkeleton chatW={chatW} />;
  }

  // Бар ленты канала: тоггл панели беседы на ПРАВОМ КРАЮ ЛЕНТЫ (закон
  // мессенджера, вердикт 15.09.2026), тон — КАРТОЧКИ (bg-card, как таб-бар:
  // бары на одной линии — ОДИН тон, зона чата темнее только НИЖЕ бара),
  // border-b продолжает линию таб-бара и бара треда.
  const chatBar = project.channelId ? (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-card px-3">
      <span className="ml-auto">
        <ChatPanelToggle open={panel.open} onToggle={panel.toggle} />
      </span>
    </div>
  ) : undefined;

  return (
    // Панель беседы — ПОЛНОВЫСОТНЫЙ сиблинг всей карточки (вердикт владельца
    // 15.09.2026, рефы Битрикс24): занимает таб-бар тоже, её шапка
    // (название + крестик у края) продолжает линию таб-бара. Колонка чата —
    // тоже ПОЛНОВЫСОТНЫЙ сиблинг (закон одного прохода, тот же вердикт):
    // окно треда внутри неё поднимается ДО ВЕРХА карточки, его бар — на
    // линии таб-бара; тоггл панели — в баре ленты канала (правый край
    // ЛЕНТЫ, закон мессенджера).
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Таб-бар КАРТОЧКИ — только вкладки (тоггл панели — в баре ленты
          канала). Органы списка (вид, поиск, фильтр, шестерёнка) — в строке
          инструментов вкладки; чипов стадии/приватности НЕТ (приватность —
          полем в «О проекте», стадия удалена как сущность — вердикт
          владельца). */}
        <div className="content-fade flex h-10 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4">
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
        </div>

        {/* Левая зона (контент вкладки) — на всю колонку карточки;
          вертикальная граница с чатом структурная (анатомия карточки
          задачи). */}
        <div className="relative flex min-h-0 flex-1 flex-col border-r border-border @container">
          <div className="content-fade min-h-0 flex-1 overflow-hidden">
            {tab === 'tasks' ? <ProjectTasksTab projectId={projectId} /> : null}
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
      </div>

      {/* Колонка обсуждения (канал проекта) — ПОЛНОВЫСОТНЫЙ сиблинг: окно
        треда внутри поднимается до верха карточки (ступеньки нет), его бар
        на линии таб-бара; бар ленты (`chatBar`) несёт тоггл панели и
        продолжает линию border-b. Панель беседы — ВНУТРИ колонки справа:
        анимируется ОДНА ширина колонки (левая зона не дёргается); лента не
        уже 360px при открытой панели (колонка ≥ 660 — тогда панель
        выталкивает левую зону, по правилу владельца). */}
      <div
        ref={chatRef}
        className={cn(
          'min-h-0 overflow-hidden',
          !dragging && 'transition-[width] duration-200 ease-out',
        )}
        style={{ width: columnW }}
      >
        <div className="flex h-full w-full bg-background">
          <div className="content-fade min-h-0 min-w-0 flex-1">
            <ProjectChat
              project={project}
              threadId={threadId}
              onOpenThread={setThreadId}
              onCloseThread={() => setThreadId(null)}
              header={chatBar}
            />
          </div>
        </div>
      </div>
      {project.channelId ? (
        <ChatSidePanel
          conversationId={project.channelId}
          open={panel.open}
          onClose={panel.close}
          title={ui.chat.aboutProject}
          headerClass="h-10"
          threadRootId={threadId}
        />
      ) : null}
    </div>
  );
}
