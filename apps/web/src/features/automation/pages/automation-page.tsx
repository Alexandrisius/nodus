import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';

import { useTaskTypes } from '../api/automation-api.js';
import { useRouteDocStore } from '../model/route-doc-store.js';
import { RouteEditor } from '../components/editor/route-editor.js';
import { TypeList } from '../components/types/type-list.js';
import { TaskTypeCreateDialog } from '../components/types/type-create-dialog.js';
import { TypeSettingsPanel } from '../components/types/type-settings.js';
import {
  fetchWorkflowDetail,
  useWorkflowDetail,
  workflowKeys,
} from '../../../shared/workflow/workflow-api.js';

/**
 * Раздел «Автоматизация» (эпик #377): единый дом настройки процессов.
 * Каркас — как окно мессенджера: слева колонка типов (bg-card, border-r,
 * шапка h-14 с поиском), справа редактор маршрута выбранного типа со своей
 * строкой инструментов (h-14, border-b — горизонталь шапок совпадает).
 * Вкладка раздела живёт в топбаре шелла — здесь названий не дублируем.
 * Глубокая ссылка `/automation?type=<id>`.
 */
export function AutomationPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { type?: string };
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

  // Мета строк списка («N статусов · M задач») читает кэш деталей — грейим
  // все маршруты раздела, чтобы невыбранные типы не показывали нули.
  useEffect(() => {
    for (const type of types ?? []) {
      void queryClient.ensureQueryData({
        queryKey: workflowKeys.detail(type.workflowId),
        queryFn: () => fetchWorkflowDetail(type.workflowId),
      });
    }
  }, [types, queryClient]);

  // Мета строк списка: стадии и задачи каждого типа (кэш деталей маршрутов).
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const type of types ?? []) {
      const detail = queryClient.getQueryData(workflowKeys.detail(type.workflowId)) as
        { document: { stages: unknown[] } } | undefined;
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

  const editorDirty = useRouteDocStore((s) => s.dirty);
  const editorWorkflowId = useRouteDocStore((s) => s.workflowId);
  const dirtyTypeIds = useMemo(() => {
    // Черновик редактора относится к одному маршруту — помечаем его строку.
    if (!editorDirty || !workflow || editorWorkflowId !== workflow.id) return new Set<string>();
    return new Set([selected?.id ?? '']);
  }, [editorDirty, editorWorkflowId, workflow, selected?.id]);

  return (
    <div className="flex h-full min-h-0">
      <TypeList
        types={types ?? []}
        stageCounts={stageCounts}
        taskCounts={taskCounts}
        dirtyIds={dirtyTypeIds}
        selectedId={selected?.id}
        isLoading={isLoading}
        onSelect={(id) => {
          void navigate({ to: '/automation', search: (prev) => ({ ...prev, type: id }) });
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onCopyType={(id) => {
          setCreateBaseTypeId(id);
          setCreateOpen(true);
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {selected && workflow ? (
          <RouteEditor
            workflow={workflow}
            settings={
              settingsOpen ? (
                <TypeSettingsPanel open type={selected} onClose={() => setSettingsOpen(false)} />
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyTitle>
                {selected ? ui.automation.workflowUnavailable : ui.automation.createFirstType}
              </EmptyTitle>
            </Empty>
          </div>
        )}
      </main>

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
