import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
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
 * Каркас — окно-сплит как мессенджер: слева колонка типов (bg-card,
 * border-r, шапка h-14 с поиском), справа редактор маршрута выбранного типа
 * со своей строкой инструментов h-14; ось контура идёт до правого края рамы
 * и служит верхней границей окна (флаг `splitWindow` реестра навигации).
 * Вкладка раздела живёт в топбаре шелла — здесь названий не дублируем.
 * Глубокая ссылка `/automation?type=<id>`.
 */
export function AutomationPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { type?: string };
  const { data: types, isLoading } = useTaskTypes('include');
  // Настройки типа открываются ДЛЯ КОНКРЕТНОЙ строки (#409): boolean терял
  // id, и панель всегда показывала selected — не тот тип, у которого нажали
  // «⋯ → Настройки типа». Выделение редактора при этом не меняется.
  const [settingsTypeId, setSettingsTypeId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBaseTypeId, setCreateBaseTypeId] = useState<string | undefined>();

  const alive = useMemo(() => (types ?? []).filter((t) => !t.archivedAt), [types]);
  const selected = useMemo(
    () => alive.find((t) => t.id === search.type) ?? alive[0],
    [alive, search.type],
  );
  const settingsType = useMemo(
    () => alive.find((t) => t.id === settingsTypeId) ?? null,
    [alive, settingsTypeId],
  );
  const settingsOpen = settingsType !== null;
  // Тип заархивировали/удалили, пока панель открыта — панель закрывается.
  useEffect(() => {
    if (settingsTypeId !== null && settingsType === null) setSettingsTypeId(null);
  }, [settingsTypeId, settingsType]);
  const workflowQuery = useWorkflowDetail(selected?.workflowId ?? null);
  const workflow = workflowQuery.data;

  // Мета строк списка («N статусов · M задач») реактивна: детали всех
  // маршрутов грузятся useQueries (один кэш с редактором и «Схемой»).
  const details = useQueries({
    queries: (types ?? []).map((type) => ({
      queryKey: workflowKeys.detail(type.workflowId),
      queryFn: () => fetchWorkflowDetail(type.workflowId),
      staleTime: 30_000,
    })),
  });
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (types ?? []).forEach((type, i) => {
      counts[type.id] = details[i]?.data?.document.stages.length ?? 0;
    });
    if (workflow && selected) counts[selected.id] = workflow.document.stages.length;
    return counts;
  }, [types, details, workflow, selected]);
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (types ?? []).forEach((type, i) => {
      const detail = details[i]?.data;
      counts[type.id] = detail
        ? Object.values(detail.stageTaskCounts).reduce((a, b) => a + b, 0)
        : 0;
    });
    return counts;
  }, [types, details]);

  // Одна правая панель за раз: выделение на холсте закрывает «Настройки
  // типа», открытие настроек снимает выделение.
  const editorSelection = useRouteDocStore((s) => s.selection);
  useEffect(() => {
    if (editorSelection) setSettingsTypeId(null);
  }, [editorSelection]);

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
          setSettingsTypeId(null);
          void navigate({ to: '/automation', search: (prev) => ({ ...prev, type: id }) });
        }}
        onOpenSettings={(id) => {
          useRouteDocStore.getState().select(null);
          setSettingsTypeId(id);
        }}
        onCopyType={(id) => {
          setCreateBaseTypeId(id);
          setCreateOpen(true);
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {selected && workflow ? (
          <RouteEditor
            type={selected}
            workflow={workflow}
            settingsOpen={settingsOpen}
            settings={
              <TypeSettingsPanel
                open={settingsOpen}
                type={settingsType ?? selected}
                onClose={() => setSettingsTypeId(null)}
              />
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
