import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useQueryClient } from '@tanstack/react-query';
import { checkWorkflowDocument } from '@nodus/contracts';
import type { TaskType, WorkflowDetail, WorkflowProblem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';
import { Plus } from 'lucide-react';

import { workflowKeys } from '../../../../shared/workflow/workflow-api.js';
import { ROUTE_GEOMETRY } from '../../../../shared/flow/route-layout.js';
import { usePublishWorkflow } from '../../api/automation-api.js';
import { useCanManageWorkflows } from '../../lib/use-can-manage-workflows.js';
import { useRouteDocStore } from '../../model/route-doc-store.js';
import { AddTransitionPopover } from './add-transition-popover.js';
import { DraftBanner, NavigationGuard, StaleDraftBanner } from './editor-parts.js';
import { EditorPanel } from './panel/editor-panel.js';
import { SIDE_PANEL_WIDTH } from './panel/side-panel.js';
import { PublishDialog } from './publish-dialog.js';
import { RouteCanvas } from './route-canvas.js';
import { RouteToolbar } from './route-toolbar.js';

/**
 * Редактор маршрута (#378 ред. 2, реф Jira workflow editor / Трекер):
 * строка инструментов (добавление сверху, публикация не уезжает), холст
 * `RouteCanvas` (общая раскладка, точки подключения, подписи на стрелках,
 * масштаб и отмена слева внизу), правая панель выделенного (разделы с
 * переходом внутрь), живые проверки `checkWorkflowDocument`, публикация.
 */
interface RouteEditorProps {
  type: TaskType;
  workflow: WorkflowDetail;
  /** Панель «Настройки типа» (та же внутриоконная панель справа, монтирована
   *  всегда) и открыта ли она сейчас — резерв строки инструментов. */
  settings?: React.ReactNode;
  settingsOpen?: boolean;
}

export function RouteEditor(props: RouteEditorProps) {
  return (
    <ReactFlowProvider>
      <RouteEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function RouteEditorInner({ type, workflow, settings, settingsOpen = false }: RouteEditorProps) {
  const doc = useRouteDocStore((s) => s.document);
  const dirty = useRouteDocStore((s) => s.dirty);
  const selection = useRouteDocStore((s) => s.selection);
  const draftSavedAt = useRouteDocStore((s) => s.draftSavedAt);
  const staleDraftAt = useRouteDocStore((s) => s.staleDraftAt);
  const pendingReload = useRouteDocStore((s) => s.pendingReload);
  // Правка закрыта без права и пока после публикации не пришла свежая версия.
  const canManage = useCanManageWorkflows() && !pendingReload;
  const publish = usePublishWorkflow(workflow.id);
  const queryClient = useQueryClient();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  // Загрузка/перезагрузка маршрута в стор (смена типа, своя или чужая
  // публикация — новая версия сервера).
  useEffect(() => {
    useRouteDocStore.getState().sync(workflow);
  }, [workflow]);

  const problems = useMemo(() => checkWorkflowDocument(doc), [doc]);
  const problemStageIds = useMemo(
    () => new Set(problems.filter((p) => p.stageId).map((p) => p.stageId as string)),
    [problems],
  );

  // Несохранённые правки: предупреждение при закрытии вкладки.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /** «Добавить статус»: «Новый статус» группы «В работе» в центре видимой
   *  части холста (левее открывающейся панели), без наложения на соседей. */
  const addStage = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const center = screenToFlowPosition({
      x: rect.left + Math.max(rect.width - SIDE_PANEL_WIDTH, rect.width / 2) / 2,
      y: rect.top + rect.height / 2,
    });
    const { stageWidth: w, stageHeight: h, rowGap } = ROUTE_GEOMETRY;
    const taken = Object.values(useRouteDocStore.getState().document.layout?.stages ?? {});
    const position = { x: center.x - w / 2, y: center.y - h / 2 };
    while (taken.some((p) => Math.abs(p.x - position.x) < w && Math.abs(p.y - position.y) < h)) {
      position.y += h + rowGap / 2;
    }
    useRouteDocStore.getState().addStage('active', position);
  };

  const onProblemClick = (problem: WorkflowProblem) => {
    const store = useRouteDocStore.getState();
    if (problem.transitionId) store.select({ kind: 'transition', id: problem.transitionId });
    else if (problem.stageId) store.select({ kind: 'stage', id: problem.stageId });
  };

  const panelOpen = selection !== null || settingsOpen;

  return (
    <div
      className={cn('relative flex min-h-0 flex-1 flex-col', panelOpen && 'flow-inspector-open')}
    >
      <RouteToolbar
        type={type}
        canManage={canManage}
        dirty={dirty}
        publishedAt={dirty ? null : workflow.publishedAt}
        publishedBy={workflow.publishedBy?.displayName ?? null}
        problems={problems}
        publishBlocked={!dirty}
        panelOpen={panelOpen}
        onAddStage={addStage}
        addTransition={
          <AddTransitionPopover
            document={doc}
            onPick={(from, to) => useRouteDocStore.getState().addTransition(from, to)}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                title={ui.automation.addTransitionLabel}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span className="@max-[760px]:hidden">{ui.automation.addTransitionLabel}</span>
              </Button>
            }
          />
        }
        onTidy={() => {
          // «Упорядочить»: авторасстановка в общую раскладку и вписать.
          useRouteDocStore.getState().arrange();
          void fitView({ duration: 200, padding: 0.2, maxZoom: 1 });
        }}
        onProblemClick={onProblemClick}
        onDiscard={() => useRouteDocStore.getState().discard()}
        onPublish={() => setPublishOpen(true)}
      />

      <div ref={canvasRef} className="relative min-h-0 flex-1">
        <RouteCanvas workflow={workflow} editable={canManage} problemStageIds={problemStageIds} />
        {dirty && draftSavedAt ? (
          <DraftBanner
            savedAt={draftSavedAt}
            onReset={() => useRouteDocStore.getState().discard()}
          />
        ) : null}
        {staleDraftAt && !dirty ? (
          <StaleDraftBanner onReset={() => useRouteDocStore.getState().discard()} />
        ) : null}
      </div>

      <EditorPanel workflow={workflow} readOnly={!canManage} />
      {settings}
      <NavigationGuard dirty={dirty} />

      {publishOpen ? (
        <PublishDialog
          open
          onClose={() => setPublishOpen(false)}
          workflow={workflow}
          baseline={useRouteDocStore.getState().baseline}
          document={doc}
          baseVersion={useRouteDocStore.getState().baseVersion}
          publish={publish}
          onPublished={() => useRouteDocStore.getState().markPublished()}
          onConflictLoad={() => {
            setPublishOpen(false);
            // Свежая версия: сброс правок + рефеч маршрута (useEffect загрузки
            // подхватит новую версию и baseVersion — повторный 409 исключён).
            useRouteDocStore.getState().discard();
            publish.reset();
            void queryClient.invalidateQueries({ queryKey: workflowKeys.detail(workflow.id) });
          }}
        />
      ) : null}
    </div>
  );
}
