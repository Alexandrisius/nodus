import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react';
import { checkWorkflowDocument } from '@nodus/contracts';
import type { TaskSystemState, WorkflowDetail, WorkflowProblem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { usePublishWorkflow } from '../../api/automation-api.js';
import { useCanManageWorkflows } from '../../lib/use-can-manage-workflows.js';
import { useRouteDocStore } from '../../model/route-doc-store.js';
import { EditorToolbar } from './editor-toolbar.js';
import { PublishDialog } from './publish-dialog.js';
import { StageInspector } from './stage-inspector.js';
import { TransitionInspector } from './transition-inspector.js';
import { FlowCanvas } from '../../../../shared/flow/flow-canvas.js';
import { buildRouteGraph } from '../../../../shared/flow/route-graph.js';
import { layoutBands, slotIndexAt } from '../../../../shared/flow/band-layout.js';

/**
 * Редактор маршрута на холсте (#378): рабочая копия в сторе, живые проверки
 * `checkWorkflowDocument`, инспекторы статуса и кнопки, публикация с
 * переносами. Раскладка автоматическая (колонки этапов), «Упорядочить» —
 * вписать схему в экран.
 */
export function RouteEditor({ workflow }: { workflow: WorkflowDetail }) {
  return (
    <ReactFlowProvider>
      <RouteEditorInner workflow={workflow} />
    </ReactFlowProvider>
  );
}

function RouteEditorInner({ workflow }: { workflow: WorkflowDetail }) {
  const canManage = useCanManageWorkflows();
  const store = useRouteDocStore();
  const publish = usePublishWorkflow(workflow.id);
  const { fitView } = useReactFlow();
  const [publishOpen, setPublishOpen] = useState(false);
  const [addTransitionFor, setAddTransitionFor] = useState<string | null>(null);

  // Загрузка/перезагрузка маршрута в стор (смена типа или версии на сервере).
  useEffect(() => {
    const state = useRouteDocStore.getState();
    if (state.workflowId !== workflow.id || state.baseVersion !== workflow.version) {
      state.load(workflow);
    }
  }, [workflow]);

  const problems = useMemo(() => checkWorkflowDocument(store.document), [store.document]);
  const problemStageIds = useMemo(
    () => new Set(problems.filter((p) => p.stageId).map((p) => p.stageId as string)),
    [problems],
  );

  const graph = useMemo(
    () =>
      buildRouteGraph(store.document, {
        readOnly: !canManage,
        problemStageIds,
        onSelectStage: (id) => useRouteDocStore.getState().select({ kind: 'stage', id }),
        onSelectTransition: (id) => useRouteDocStore.getState().select({ kind: 'transition', id }),
        onAddStage: (band: TaskSystemState) => useRouteDocStore.getState().addStage(band),
      }),
    [store.document, canManage, problemStageIds],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canManage) return;
      const s = useRouteDocStore.getState();
      if (connection.source === 'route-start') {
        if (connection.target) s.patchStage(connection.target, { isInitial: true });
        return;
      }
      if (connection.source && connection.target)
        s.addTransition(connection.source, connection.target);
    },
    [canManage],
  );

  const onNodeDragStop: OnNodeDrag<Node> = useCallback(
    (_event, node: Node) => {
      if (!canManage || node.type !== 'status' || !node.parentId) return;
      const s = useRouteDocStore.getState();
      const layout = layoutBands(s.document.stages);
      s.moveStage(node.id, slotIndexAt(layout, node.id, node.position.y));
    },
    [canManage],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_event, node: Node) => {
    if (node.type === 'status') useRouteDocStore.getState().select({ kind: 'stage', id: node.id });
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — вне полей ввода.
  useEffect(() => {
    if (!canManage) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        useRouteDocStore.getState().undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        useRouteDocStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canManage]);

  // Несохранённые правки: предупреждение при закрытии вкладки.
  useEffect(() => {
    if (!store.dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [store.dirty]);

  const selectedStage =
    store.selection?.kind === 'stage'
      ? (store.document.stages.find((s) => s.id === store.selection?.id) ?? null)
      : null;
  const selectedTransition =
    store.selection?.kind === 'transition'
      ? (store.document.transitions.find((t) => t.id === store.selection?.id) ?? null)
      : null;

  const onProblemClick = (problem: WorkflowProblem) => {
    if (problem.transitionId) store.select({ kind: 'transition', id: problem.transitionId });
    else if (problem.stageId) store.select({ kind: 'stage', id: problem.stageId });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <FlowCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => store.select(null)}
        onEdgeClick={(_event, edge) => {
          if (edge.type === 'transition') store.select({ kind: 'transition', id: edge.id });
        }}
        interactive={canManage}
        fitView
      >
        <ZoomControls />
      </FlowCanvas>

      <div className="absolute bottom-2 left-2 z-10">
        <EditorToolbar
          canManage={canManage}
          dirty={store.dirty}
          problems={problems}
          canUndo={store.past.length > 0}
          canRedo={store.future.length > 0}
          publishBlocked={!store.dirty}
          onUndo={() => store.undo()}
          onRedo={() => store.redo()}
          onTidy={() => void fitView({ duration: 200, padding: 0.2 })}
          onProblemClick={onProblemClick}
          onDiscard={() => store.discard()}
          onPublish={() => setPublishOpen(true)}
        />
      </div>

      {store.dirty && store.draftSavedAt ? (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-2 rounded-full border border-warning/40 bg-warning-soft/60 px-3 py-1.5 text-xs text-warning">
          {ui.automation.draftContinue}{' '}
          {new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
            new Date(store.draftSavedAt),
          )}
          <button
            type="button"
            onClick={() => store.discard()}
            className="font-medium underline underline-offset-2"
          >
            {ui.automation.draftReset}
          </button>
        </div>
      ) : null}

      <StageInspector
        stage={selectedStage}
        document={store.document}
        taskCount={selectedStage ? (workflow.stageTaskCounts[selectedStage.id] ?? 0) : 0}
        selection={store.selection}
        readOnly={!canManage}
        onClose={() => store.select(null)}
        onPatch={(id, patch) => store.patchStage(id, patch)}
        onRemove={(id) => store.removeStage(id)}
        onMoveTransition={(id, index) => store.moveTransition(id, index)}
        onSelectTransition={(ref) => store.select(ref)}
        onAddTransition={(fromStageId) => setAddTransitionFor(fromStageId)}
      />
      <TransitionInspector
        transition={selectedTransition}
        document={store.document}
        readOnly={!canManage}
        onClose={() => store.select(null)}
        onPatch={(id, patch) => store.patchTransition(id, patch)}
        onSetPrimary={(id) => store.setTransitionPrimary(id)}
        onRemove={(id) => store.removeTransition(id)}
      />

      {addTransitionFor ? (
        <TargetPicker
          document={store.document}
          fromStageId={addTransitionFor}
          onPick={(toStageId) => {
            store.addTransition(addTransitionFor, toStageId);
            setAddTransitionFor(null);
          }}
          onClose={() => setAddTransitionFor(null)}
        />
      ) : null}

      {publishOpen ? (
        <PublishDialog
          open
          onClose={() => setPublishOpen(false)}
          workflow={workflow}
          baseline={store.baseline}
          document={store.document}
          baseVersion={store.baseVersion}
          publish={publish}
          onPublished={(result) => store.markPublished(result.version)}
          onConflictLoad={() => {
            setPublishOpen(false);
            store.discard();
            publish.reset();
          }}
        />
      ) : null}
    </div>
  );
}

/** Кнопки масштаба и «вписать» — правый нижний угол холста. */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const btn =
    'flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-input hover:text-foreground';
  return (
    <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1">
      <button
        type="button"
        aria-label={ui.automation.zoomIn}
        className={btn}
        onClick={() => void zoomIn({ duration: 150 })}
      >
        +
      </button>
      <button
        type="button"
        aria-label={ui.automation.zoomOut}
        className={btn}
        onClick={() => void zoomOut({ duration: 150 })}
      >
        −
      </button>
      <button
        type="button"
        aria-label={ui.automation.fitView}
        className={btn}
        onClick={() => void fitView({ duration: 200, padding: 0.2 })}
      >
        ⤢
      </button>
    </div>
  );
}

/** Выбор целевого статуса новой кнопки («+ Кнопка» инспектора статуса). */
function TargetPicker({
  document: doc,
  fromStageId,
  onPick,
  onClose,
}: {
  document: ReturnType<typeof useRouteDocStore.getState>['document'];
  fromStageId: string;
  onPick: (toStageId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/60"
      role="dialog"
      aria-label={ui.automation.toStage}
    >
      <div className="w-72 rounded-[14px] border bg-card p-2">
        <p className="px-2 pb-1.5 text-label text-muted-foreground">{ui.automation.toStage}</p>
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {doc.stages
            .filter((s) => s.id !== fromStageId)
            .map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => onPick(stage.id)}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                )}
              >
                {stage.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {ui.automation.bands[stage.systemState]}
                </span>
              </button>
            ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          {ui.common.cancel}
        </button>
      </div>
    </div>
  );
}
