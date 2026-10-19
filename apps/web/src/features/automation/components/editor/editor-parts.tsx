import { useReactFlow } from '@xyflow/react';
import type { WorkflowDraftDocument } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/** Составные части редактора маршрута (#378): зум-кнопки, баннер черновика,
 *  выбор цели новой кнопки. */

/** Кнопки масштаба и «вписать» — правый нижний угол холста. */
export function ZoomControls() {
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
export function TargetPicker({
  document: doc,
  fromStageId,
  onPick,
  onClose,
}: {
  document: WorkflowDraftDocument;
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

/** Баннер черновика: «Продолжить черновик от 14:02 / Сбросить». */
export function DraftBanner({ savedAt, onReset }: { savedAt: string; onReset: () => void }) {
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(savedAt),
  );
  return (
    <div className="absolute left-2 top-2 z-10 flex items-center gap-2 rounded-full border border-warning/40 bg-warning-soft/60 px-3 py-1.5 text-xs text-warning">
      {ui.automation.draftContinue} {time}
      <button type="button" onClick={onReset} className="font-medium underline underline-offset-2">
        {ui.automation.draftReset}
      </button>
    </div>
  );
}

import { useBlocker } from '@tanstack/react-router';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';

/** Блокер навигации при несохранённых правках маршрута (#378, раздел 7 спеки):
 *  уход с раздела — с подтверждением (черновик в localStorage смягчает потерю,
 *  но осознанный вопрос честнее тихого «продолжится потом»). */
export function NavigationGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true });
  return (
    <Dialog open={blocker.status === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.automation.unsavedTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{ui.automation.draftStale}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            {ui.common.cancel}
          </Button>
          <Button onClick={() => blocker.proceed?.()}>{ui.automation.discard}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
