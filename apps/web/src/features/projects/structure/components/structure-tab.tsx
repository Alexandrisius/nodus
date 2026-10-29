import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { NodeLevel, ProjectNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useOpenCard } from '../../../../app/shell/use-card-stack.js';
import { projectsKeys } from '../../../../shared/api/projects-list.js';
import { openTaskCreate } from '../../../../shared/tasks/task-create-store.js';
import { DataTableHeader } from '../../../../shared/views/data-table-header.js';
import { useAutoFitColumn } from '../../../../shared/views/use-autofit-column.js';
import { useRowSelection } from '../../../../shared/views/use-row-selection.js';
import { useViewFields } from '../../../../shared/views/use-view-fields.js';
import { useProjectTaskPages } from '../../api/projects-api.js';
import {
  structureKeys,
  useMoveNode,
  useProjectStructure,
  useSetTasksNode,
} from '../api/structure-api.js';
import { STRUCTURE_VIEW_KEY, structureFields, structureGrid } from '../lib/structure-fields.js';
import { buildStructureRows, filterVisibleRows } from '../lib/structure-tree.js';
import { useStructureDnd } from '../lib/use-structure-dnd.js';
import { StructureDragPlate } from './structure-drag-plate.js';
import { StructureDialogHost, type StructureDialog } from './structure-dialog-host.js';
import {
  StructureNoNodeRowView,
  StructureNodeRowView,
  StructureTaskRowView,
} from './structure-rows.js';
import { nodeMenuItems, taskMenuItems, type StructureMenuActions } from './structure-menus.js';
import { StructureEmpty, StructureToolbar } from './structure-toolbar.js';

/**
 * Вкладка «Структура» карточки проекта (#467, ADR-0030): дерево узлов-папок с
 * задачами-листьями и агрегатами поддерева (план/факт/сроки/прогресс), секция
 * «Без узла». Механика: DnD (узлы и мультиселект задач, зоны четверти, блок
 * циклов, авто-раскрытие), меню строки (шашка + ПКМ), окна создания/пачки/
 * правки/переноса, «+ задача» на узле — пресетом окна создания. Строки при
 * перетаскивании статичны — меняется только индикация (урок gotchas).
 */
export function StructureTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const openCard = useOpenCard();
  const { data: structure, isLoading } = useProjectStructure(projectId);
  const tasksQuery = useProjectTaskPages(projectId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [dialog, setDialog] = useState<StructureDialog | null>(null);
  const moveNode = useMoveNode(projectId);
  const setTasksNode = useSetTasksNode(projectId);
  const { visibleFields, sort, setWidth, cycleSort, commitOrder } = useViewFields(
    STRUCTURE_VIEW_KEY,
    structureFields,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const autoFitColumn = useAutoFitColumn(containerRef, 1, setWidth);

  const tasks = useMemo(
    () => tasksQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [tasksQuery.data],
  );
  const nodes = useMemo<ProjectNode[]>(() => structure?.nodes ?? [], [structure]);
  const levels = useMemo<NodeLevel[]>(() => structure?.levels ?? [], [structure]);
  const levelById = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const rows = useMemo(() => buildStructureRows(nodes, tasks), [nodes, tasks]);
  const visible = useMemo(() => filterVisibleRows(rows, collapsed), [rows, collapsed]);
  const gridTemplateColumns = structureGrid(visibleFields);

  const visibleTaskIds = useMemo(
    () => visible.flatMap((r) => (r.kind === 'task' ? [r.task.id] : [])),
    [visible],
  );
  const selection = useRowSelection(visibleTaskIds);
  const selectedIds = useMemo(() => [...selection.selected], [selection.selected]);
  const branchIds = useMemo(
    () => rows.flatMap((r) => (r.kind === 'node' && r.hasChildren ? [r.node.id] : [])),
    [rows],
  );

  const dnd = useStructureDnd({
    nodes,
    expanded: (id) => !collapsed.has(id),
    expand: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
    onDropNode: (nodeId, parentId, beforeId, afterId) =>
      moveNode.mutate({
        nodeId,
        parentId,
        ...(beforeId ? { beforeId } : {}),
        ...(afterId ? { afterId } : {}),
      }),
    onDropTasks: (taskIds, nodeId) => setTasksNode.mutate({ taskIds, nodeId }),
  });

  function toggleBranch(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTaskToNode(node: ProjectNode) {
    openTaskCreate({
      projectId,
      nodeId: node.id,
      contextLabel: ui.structure.nodeContext.replace('{name}', node.name),
      onCreated: () => {
        void queryClient.invalidateQueries({ queryKey: structureKeys.of(projectId) });
        void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
      },
    });
  }

  const actions: StructureMenuActions = {
    createInside: (node) => setDialog({ kind: 'create', parent: node }),
    createBatchInside: (node) => setDialog({ kind: 'batch', parent: node }),
    addTask: addTaskToNode,
    rename: (node) => setDialog({ kind: 'rename', node }),
    moveNode: (node) => setDialog({ kind: 'moveNode', node }),
    deleteNode: (node) => setDialog({ kind: 'delete', node }),
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const target = dnd.dropTarget;
  const zoneOf = (id: string) =>
    target && target.overId === `node:${id}` && !target.invalid ? target.zone : null;

  return (
    <div className="flex h-full flex-col">
      <StructureToolbar
        onCreateNode={() => setDialog({ kind: 'create', parent: null })}
        onCreateBatch={() => setDialog({ kind: 'batch', parent: null })}
        onExpandAll={() => setCollapsed(new Set())}
        onCollapseAll={() => setCollapsed(new Set(branchIds))}
      />
      <DndContext {...dnd.context}>
        <div
          ref={containerRef}
          role="table"
          aria-label={ui.projects.tabStructure}
          className="min-h-0 flex-1 overflow-auto"
        >
          {nodes.length === 0 ? (
            <StructureEmpty onCreateNode={() => setDialog({ kind: 'create', parent: null })} />
          ) : (
            <>
              <DataTableHeader
                fields={visibleFields}
                sort={sort}
                headerChecked={selection.headerChecked}
                hasActions={false}
                style={{ gridTemplateColumns }}
                onToggleAll={selection.toggleAll}
                onResize={setWidth}
                onAutoFit={autoFitColumn}
                onCycleSort={cycleSort}
                onReorder={commitOrder}
              />
              <div className="relative">
                {visible.map((row) => {
                  if (row.kind === 'node') {
                    return (
                      <StructureNodeRowView
                        key={row.node.id}
                        row={row}
                        level={levelById.get(row.node.levelId)}
                        collapsed={collapsed.has(row.node.id)}
                        onToggle={() => toggleBranch(row.node.id)}
                        items={nodeMenuItems(row.node, actions)}
                        zone={zoneOf(row.node.id)}
                        invalid={target?.overId === `node:${row.node.id}` && target.invalid}
                        isDragging={
                          dnd.active?.kind === 'node' && dnd.active.nodeId === row.node.id
                        }
                        grid={{ templateColumns: gridTemplateColumns }}
                      />
                    );
                  }
                  if (row.kind === 'noNode') {
                    return (
                      <StructureNoNodeRowView
                        key="no-node"
                        count={row.count}
                        dropActive={target?.overId === 'no-node' && !target.invalid}
                      />
                    );
                  }
                  const isSelected = selection.selected.has(row.task.id);
                  return (
                    <StructureTaskRowView
                      key={row.task.id}
                      row={row}
                      selected={isSelected}
                      onToggleSelected={() => selection.toggle(row.task.id)}
                      items={taskMenuItems(row.task.id, {
                        open: (id, anchor) => {
                          if (anchor)
                            openCard({ kind: 'task', id }, anchor.getBoundingClientRect());
                        },
                        moveTasks: (ids) => setDialog({ kind: 'moveTasks', taskIds: ids }),
                        removeFromStructure: (id) =>
                          setTasksNode.mutate({ taskIds: [id], nodeId: null }),
                        inStructure: row.task.nodeId !== null,
                      })}
                      onOpen={(anchor) =>
                        openCard({ kind: 'task', id: row.task.id }, anchor.getBoundingClientRect())
                      }
                      dragData={{
                        kind: 'tasks',
                        taskIds: isSelected && selectedIds.length > 1 ? selectedIds : [row.task.id],
                      }}
                      isDragging={
                        dnd.active?.kind === 'tasks' && dnd.active.taskIds.includes(row.task.id)
                      }
                      grid={{ templateColumns: gridTemplateColumns }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
        <DragOverlay>
          {dnd.active ? (
            <StructureDragPlate active={dnd.active} nodes={nodes} tasks={tasks} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {dialog ? (
        <StructureDialogHost
          projectId={projectId}
          dialog={dialog}
          levels={levels}
          nodes={nodes}
          onClose={() => setDialog(null)}
          onMoveTasks={(taskIds, nodeId) => setTasksNode.mutate({ taskIds, nodeId })}
        />
      ) : null}
    </div>
  );
}
