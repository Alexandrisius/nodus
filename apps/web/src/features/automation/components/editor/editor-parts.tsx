import { useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import type { WorkflowDraftDocument } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { cn } from '@nodus/ui/lib/utils';

/** Составные части редактора маршрута (#378): диалоги добавления кнопки,
 *  баннер черновика, выбор цели из инспектора. */

/** Баннер черновика (верх канваса, по центру): «Продолжить черновик от
 *  14:02 / Сбросить». */
export function DraftBanner({ savedAt, onReset }: { savedAt: string; onReset: () => void }) {
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(savedAt),
  );
  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-warning/40 bg-warning-soft/60 px-3 py-1.5 text-xs text-warning">
      {ui.automation.draftContinue} {time}
      <button type="button" onClick={onReset} className="font-medium underline underline-offset-2">
        {ui.automation.draftReset}
      </button>
    </div>
  );
}

/** «+ Кнопка» из тулбара: выбор откуда → куда (имя подставит стор). */
export function AddTransitionDialog({
  document: doc,
  onClose,
  onPick,
}: {
  document: WorkflowDraftDocument;
  onClose: () => void;
  onPick: (from: string | null, to: string) => void;
}) {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const valid = to !== '' && (from === 'any' || (from !== '' && from !== to));

  const stageOptions = doc.stages.map((s) => ({
    value: s.id,
    label: s.name,
    band: ui.automation.bands[s.systemState],
  }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.automation.addTransitionTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-muted-foreground">{ui.automation.fromStage}</span>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={ui.automation.fromStage} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="any">{ui.automation.anyStage}</SelectItem>
                {stageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    <span className="ml-2 text-xs text-muted-foreground">{option.band}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-muted-foreground">{ui.automation.toStage}</span>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={ui.automation.toStage} />
              </SelectTrigger>
              <SelectContent position="popper">
                {stageOptions
                  .filter((option) => option.value !== from)
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                      <span className="ml-2 text-xs text-muted-foreground">{option.band}</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {ui.common.cancel}
          </Button>
          <Button disabled={!valid} onClick={() => onPick(from === 'any' ? null : from, to)}>
            {ui.automation.addTransitionSubmit}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
        <p className="text-sm text-muted-foreground">{ui.automation.unsavedBody}</p>
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
