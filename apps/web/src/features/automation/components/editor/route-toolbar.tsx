import type { ProcessType, WorkflowProblem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { LayoutGrid, Plus } from 'lucide-react';

import { ProcessTypeGlyph } from '../../../../shared/workflow/process-type-icon.js';
import { ProblemsChip } from './problems-chip.js';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Верхний бар окна редактора (#378 ред. 2) — как бар беседы мессенджера:
 * h-14 с линией border-b (её продолжают шапка списка типов слева и шапка
 * правой панели справа). Слева — тип и состояние (черновик / опубликовано,
 * проблемы), затем «+ Статус», «+ Переход», «Упорядочить» (как в Трекере);
 * справа — «Сбросить» и «Опубликовать». Масштаб и отмена — на холсте слева
 * внизу. Бар живёт в колонке холста и сужается вместе с ней, когда выезжает
 * панель: подписи действий прячутся (контейнерные брейкпоинты), левая часть
 * обрезается — «Опубликовать» не уезжает никогда.
 */
export function RouteToolbar({
  type,
  canManage,
  dirty,
  publishedAt,
  publishedBy,
  problems,
  publishBlocked,
  addTransition,
  onAddStage,
  onTidy,
  onProblemClick,
  onDiscard,
  onPublish,
}: {
  type: ProcessType;
  canManage: boolean;
  dirty: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  problems: readonly WorkflowProblem[];
  publishBlocked: boolean;
  /** Кнопка-поповер «+ Переход» (хостит редактор). */
  addTransition: React.ReactNode;
  onAddStage: () => void;
  onTidy: () => void;
  onProblemClick: (problem: WorkflowProblem) => void;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  const errors = problems.filter((p) => p.severity === 'error').length;
  return (
    <header
      // nokey: клавиши на кнопках строки не удаляют выделенное на холсте.
      className="nokey @container flex h-14 shrink-0 items-center gap-2 border-b border-border px-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span className="flex min-w-0 shrink items-center gap-2" title={type.name}>
          <ProcessTypeGlyph icon={type.icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{type.name}</span>
        </span>
        {!canManage ? (
          <span className="shrink-0 rounded-full border border-border bg-accent/40 px-2.5 py-1 text-xs text-muted-foreground">
            {ui.automation.readOnly}
          </span>
        ) : dirty ? (
          <span className="shrink-0 truncate rounded-full border border-warning/40 bg-warning-soft/60 px-2.5 py-1 text-xs text-warning @max-[640px]:hidden">
            {ui.automation.chipDraft}
          </span>
        ) : publishedAt ? (
          <span
            className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums @max-[640px]:hidden"
            title={`${ui.automation.chipPublishedAt} ${formatDate(publishedAt)}${publishedBy ? ` · ${publishedBy}` : ''}`}
          >
            {formatDate(publishedAt)}
          </span>
        ) : null}
        {problems.length > 0 ? (
          <ProblemsChip problems={problems} onProblemClick={onProblemClick} />
        ) : null}
        {canManage ? (
          <>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onAddStage}
              title={ui.automation.addStage}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              <span className="@max-[760px]:hidden">{ui.automation.addStage}</span>
            </Button>
            {addTransition}
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onTidy}
              title={ui.automation.tidyUp}
            >
              <LayoutGrid className="size-3.5" strokeWidth={1.75} />
              <span className="@max-[880px]:hidden">{ui.automation.tidyUp}</span>
            </Button>
          </>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              {ui.automation.discardShort}
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={publishBlocked || errors > 0}
            title={errors > 0 ? `${ui.automation.problemsFixFirst} ${errors}` : undefined}
            onClick={onPublish}
          >
            {ui.automation.publish}
          </Button>
        </div>
      ) : null}
    </header>
  );
}
