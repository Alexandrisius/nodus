import { useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useTaskTypes } from '../api/automation-api.js';
import { useRouteDocStore } from '../model/route-doc-store.js';
import { RouteEditor } from '../components/editor/route-editor.js';
import { TypeHeader } from '../components/types/type-header.js';
import { TypeList } from '../components/types/type-list.js';
import { TaskTypeCreateDialog } from '../components/types/type-create-dialog.js';
import { TypeSettingsPanel } from '../components/types/type-settings.js';
import { useWorkflowDetail, workflowKeys } from '../../../shared/workflow/workflow-api.js';

/**
 * Раздел «Автоматизация» (эпик #377): единый дом настройки процессов — один
 * пункт меню, вкладки сверху; сейчас — «Типы задач» (вкладка «Права
 * доступа» — #379). Слева библиотека типов, справа холст маршрута
 * выбранного типа; глубокая ссылка `/automation?tab=types&type=<id>`.
 */
export function AutomationPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string; type?: string };
  const queryClient = useQueryClient();
  const { data: types, isLoading } = useTaskTypes('include');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBaseTypeId, setCreateBaseTypeId] = useState<string | undefined>();

  const alive = useMemo(() => (types ?? []).filter((t) => !t.archivedAt), [types]);
  const selected = useMemo(
    () => alive.find((t) => t.id === search.type) ?? alive[0],
    [alive, search.type],
  );
  const workflowQuery = useWorkflowDetail(selected?.workflowId ?? null);
  const workflow = workflowQuery.data;
  const editorDirty = useRouteDocStore((s) => s.dirty);
  const editorWorkflowId = useRouteDocStore((s) => s.workflowId);
  const dirty = editorWorkflowId === selected?.workflowId && editorDirty;

  // Мета строк списка: стадии и задачи каждого типа (кэш деталей маршрутов).
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const type of types ?? []) {
      const detail = queryClient.getQueryData(workflowKeys.detail(type.workflowId)) as
        { document: { stages: unknown[] }; stageTaskCounts: Record<string, number> } | undefined;
      counts[type.id] = detail?.document.stages.length ?? 0;
    }
    if (workflow && selected) counts[selected.id] = workflow.document.stages.length;
    return counts;
  }, [types, queryClient, workflow, selected]);
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const type of types ?? []) {
      const detail = queryClient.getQueryData(workflowKeys.detail(type.workflowId)) as
        { stageTaskCounts: Record<string, number> } | undefined;
      counts[type.id] = detail
        ? Object.values(detail.stageTaskCounts).reduce((a, b) => a + b, 0)
        : 0;
    }
    return counts;
  }, [types, queryClient]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Вкладки раздела (сейчас одна; «Права доступа» — #379). */}
      <div className="flex h-10 shrink-0 items-center gap-1 px-4">
        {[{ id: 'types', label: ui.automation.tabTypes }].map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={(search.tab ?? 'types') === tab.id || undefined}
            onClick={() => {
              void navigate({ to: '/automation', search: (prev) => ({ ...prev, tab: tab.id }) });
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              (search.tab ?? 'types') === tab.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {isLoading ? (
          <div className="flex-1 p-8 text-sm text-muted-foreground">{ui.common.loadError}</div>
        ) : (
          <>
            <TypeList types={types ?? []} stageCounts={stageCounts} taskCounts={taskCounts} />
            <div className="relative flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <TypeHeader
                    type={selected}
                    workflow={workflow}
                    dirty={dirty}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onCopyType={() => {
                      setCreateBaseTypeId(selected.id);
                      setCreateOpen(true);
                    }}
                  />
                  {workflow ? (
                    <RouteEditor workflow={workflow} />
                  ) : (
                    <div className="flex-1 p-8 text-sm text-muted-foreground">
                      {ui.common.loadError}
                    </div>
                  )}
                  <TypeSettingsPanel
                    open={settingsOpen}
                    type={selected}
                    onClose={() => setSettingsOpen(false)}
                  />
                </>
              ) : null}
            </div>
          </>
        )}
      </div>

      {createOpen ? (
        <TaskTypeCreateDialog
          defaultBaseTypeId={createBaseTypeId}
          onClose={() => {
            setCreateOpen(false);
            setCreateBaseTypeId(undefined);
          }}
        />
      ) : null}
    </div>
  );
}
