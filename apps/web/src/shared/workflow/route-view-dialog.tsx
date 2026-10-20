import { useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskDetail, TaskTransition } from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';
import { Button } from '@nodus/ui/components/button';
import { Waypoints } from 'lucide-react';

import { useAuthStore } from '../auth-store.js';
import { FlowCanvas } from '../flow/flow-canvas.js';
import { buildRouteGraph } from '../flow/route-graph.js';
import { useWorkflowDetail } from './workflow-api.js';

/**
 * «Схема маршрута» задачи (#378): большой диалог (~1200×80vh) с холстом
 * только для чтения — расстановка общая (как её оставил настройщик),
 * текущий статус светится, кнопки, доступные пользователю, — в силе,
 * остальные приглушены. Холст вписывается после раскрытия диалога.
 * «Открыть в редакторе» — только с правом `task.workflow_manage`.
 */
export function RouteViewDialog({
  open,
  onClose,
  task,
  transitions,
}: {
  open: boolean;
  onClose: () => void;
  task: TaskDetail;
  transitions: readonly TaskTransition[] | undefined;
}) {
  const workflow = useWorkflowDetail(open ? task.workflowId : null);
  const navigate = useNavigate();
  const canManage = (useAuthStore((s) => s.user?.permissions) ?? []).includes(
    Permission.TASK_WORKFLOW_MANAGE,
  );

  const graph = useMemo(() => {
    if (!workflow.data) return null;
    return buildRouteGraph(workflow.data.document, {
      readOnly: true,
      currentStageId: task.stage.id,
      highlightedTransitionIds: new Set(transitions?.map((t) => t.id) ?? []),
    });
  }, [workflow.data, task.stage.id, transitions]);

  const typeId = workflow.data?.typeIds[0];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[80vh] w-[92vw] max-w-[1200px] flex-col sm:max-w-[1200px]">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>
            {ui.automation.routeViewOfType} «{task.type.name}»
          </DialogTitle>
          {canManage && typeId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
                void navigate({
                  to: '/automation',
                  search: (prev) => ({ ...prev, tab: 'types', type: typeId }),
                });
              }}
            >
              <Waypoints className="size-3.5" strokeWidth={1.75} />
              {ui.automation.openInEditor}
            </Button>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 rounded-[14px] border">
          {graph ? (
            <ReactFlowProvider>
              <FlowCanvas nodes={graph.nodes} edges={graph.edges} interactive={false} />
            </ReactFlowProvider>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
