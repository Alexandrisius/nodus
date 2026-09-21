import { useMemo } from 'react';
import type { TaskListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { formatMinutes } from '../../../shared/lib/format.js';
import { stageTone } from '../../../shared/ui/board/stage-tone.js';
import { chartRowTone } from '../../../shared/ui/identity-tone.js';
import { useProjectTaskPages } from '../api/projects-api.js';

function isDone(task: TaskListItem): boolean {
  return task.stage.systemState === 'done' || task.stage.systemState === 'closed';
}

function KpiTile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="node-panel p-4">
      <NodeLabel label={label} />
      <div
        className={cn(
          'mt-2 font-mono text-2xl font-semibold tabular-nums',
          danger ? 'text-danger' : 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  barClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 truncate text-sm">{label}</span>
      <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-accent/50">
        <span
          className={cn('block h-full rounded-full', barClass)}
          style={{ width: `${max > 0 ? Math.max((value / max) * 100, value > 0 ? 3 : 0) : 0}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-label-sm text-muted-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * Вкладка «Отчёт» карточки проекта — ВИТРИНА будущей аналитики (вердикт
 * владельца 2026-09-11, раунд 3: BI-дашборд с графиками): KPI-плитки,
 * распределение задач по стадиям (бары в тоне стадий), нагрузка по
 * исполнителям, суммарные трудозатраты. Считается из реальных задач
 * проекта — логика честная, графики упрощённые; полноценный модуль
 * отчётов (фильтры периода, экспорт, сохранённые дашборды) — после MVP
 * (инвариант I14: данные уже собираются как актив аналитики).
 */
export function ProjectReport({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectTaskPages(projectId);

  const model = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const today = new Date().setHours(0, 0, 0, 0);
    const byStage = new Map<
      string,
      { name: string; color: keyof typeof stageTone; count: number }
    >();
    const byAssignee = new Map<string, number>();
    let spent = 0;
    for (const task of items) {
      const stage = byStage.get(task.stage.id) ?? {
        name: task.stage.name,
        color: task.stage.color,
        count: 0,
      };
      stage.count += 1;
      byStage.set(task.stage.id, stage);
      if (!isDone(task)) {
        const name = task.assignee?.displayName ?? ui.common.notSet;
        byAssignee.set(name, (byAssignee.get(name) ?? 0) + 1);
      }
      spent += task.spentMinutes;
    }
    return {
      total: items.length,
      active: items.filter((t) => t.stage.systemState === 'active').length,
      done: items.filter(isDone).length,
      overdue: items.filter(
        (t) => !isDone(t) && t.deadline !== null && new Date(t.deadline).getTime() < today,
      ).length,
      stages: [...byStage.values()],
      assignees: [...byAssignee.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      spent,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const maxStage = Math.max(...model.stages.map((s) => s.count), 1);
  const maxAssignee = Math.max(...model.assignees.map((a) => a.count), 1);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 @min-[45rem]:grid-cols-4">
          <KpiTile label={ui.projects.report.total} value={String(model.total)} />
          <KpiTile label={ui.projects.report.active} value={String(model.active)} />
          <KpiTile label={ui.projects.report.done} value={String(model.done)} />
          <KpiTile
            label={ui.projects.report.overdue}
            value={String(model.overdue)}
            danger={model.overdue > 0}
          />
        </div>

        <div className="grid gap-3 @min-[45rem]:grid-cols-2">
          <section className="node-panel p-4">
            <NodeLabel label={ui.projects.report.byStage} />
            <div className="mt-3 flex flex-col gap-2.5">
              {model.stages.map((stage) => (
                <BarRow
                  key={stage.name}
                  label={stage.name}
                  value={stage.count}
                  max={maxStage}
                  barClass={stageTone[stage.color].dot}
                />
              ))}
            </div>
          </section>

          <section className="node-panel p-4">
            <NodeLabel label={ui.projects.report.byAssignee} />
            <div className="mt-3 flex flex-col gap-2.5">
              {model.assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ui.common.empty}</p>
              ) : (
                model.assignees.map((assignee, i) => (
                  <BarRow
                    key={assignee.name}
                    label={assignee.name}
                    value={assignee.count}
                    max={maxAssignee}
                    barClass={chartRowTone(i)}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        <section className="node-panel p-4">
          <NodeLabel label={ui.projects.report.spent} />
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatMinutes(model.spent)}
          </div>
        </section>
      </div>
    </div>
  );
}
