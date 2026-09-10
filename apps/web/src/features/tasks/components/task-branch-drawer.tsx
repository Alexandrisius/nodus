import { memo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { TaskBranchNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { Input } from '@nodus/ui/components/input';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { useAddSubtaskTo, useTaskBranch } from '../api/tasks-api.js';
import { stageTone } from '../../../shared/ui/board/stage-tone.js';

/** Панель-навигатор ветки задачи (референс — левая панель подзадач ClickUp):
 *  дерево от корневого предка с любой вложенностью; клик по строке открывает
 *  ту задачу в этом же слайдере (панель остаётся — навигация по ветке),
 *  текущая задача подсвечена; быстрое создание подзадачи — внизу (к текущей)
 *  или по «+» на строке (к этой строке). Выдвигается слева поверх контента. */
export const TaskBranchDrawer = memo(function TaskBranchDrawer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const { data: branch } = useTaskBranch(taskId);
  const addSubtask = useAddSubtaskTo();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function openTask(id: string) {
    if (id === taskId) return;
    void navigate({ to: '/tasks/$taskId', params: { taskId: id }, search: (prev) => prev });
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitSubtask(parentId: string) {
    const title = draft.trim();
    if (!title || addSubtask.isPending) return;
    setDraft('');
    setAddingTo(null);
    addSubtask.mutate({ parentId, title });
  }

  function renderNode(node: TaskBranchNode, depth: number): React.ReactNode {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isCurrent = node.id === taskId;
    return (
      <div key={node.id}>
        <div
          className={cn(
            'group flex items-center gap-1.5 rounded-md py-1 pr-1 pl-1.5 transition-colors',
            isCurrent
              ? 'bg-accent text-foreground'
              : 'text-secondary-foreground hover:bg-accent/50',
          )}
          style={{ marginLeft: depth * 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={isCollapsed ? ui.tasks.expandBranch : ui.tasks.collapseBranch}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              )}
            </button>
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-full', stageTone[node.stageColor].dot)}
            title={node.stageName}
          />
          <button
            type="button"
            onClick={() => openTask(node.id)}
            className="min-w-0 flex-1 truncate text-left text-sm"
            title={node.title}
          >
            {node.title}
          </button>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
            {node.number}
          </span>
          <button
            type="button"
            aria-label={ui.tasks.subtasks}
            onClick={() => {
              setAddingTo(node.id);
              setDraft('');
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
        {addingTo === node.id ? (
          <InlineAdd
            depth={depth + 1}
            draft={draft}
            onDraft={setDraft}
            onSubmit={() => submitSubtask(node.id)}
            onCancel={() => setAddingTo(null)}
          />
        ) : null}
        {hasChildren && !isCollapsed
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  }

  return (
    <div className="flex h-full w-[300px] flex-col border-r border-border bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {ui.tasks.branch}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={ui.common.close}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {branch ? (
          renderNode(branch.root, 0)
        ) : (
          <div className="flex flex-col gap-2 p-1">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        )}
      </div>
      <form
        className="shrink-0 border-t border-border p-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          submitSubtask(taskId);
        }}
      >
        <Input
          value={addingTo === null ? draft : ''}
          onChange={(e) => {
            setAddingTo(null);
            setDraft(e.target.value);
          }}
          placeholder={ui.tasks.branchPlaceholder}
          className="h-8 text-sm"
        />
      </form>
    </div>
  );
});

function InlineAdd({
  depth,
  draft,
  onDraft,
  onSubmit,
  onCancel,
}: {
  depth: number;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ marginLeft: depth * 14 }} className="py-1 pl-1.5">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCancel}
        placeholder={ui.tasks.subtaskPlaceholder}
        className="h-7 text-sm"
      />
    </div>
  );
}
