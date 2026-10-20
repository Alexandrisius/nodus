import { useState } from 'react';
import type { WorkflowDraftDocument } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

const ANY = 'any';

/**
 * «Добавить переход» (#378 ред. 2): поповер «Откуда / Куда» на Select Nodus
 * (без нативных списков). «Откуда» — статус или «Любой статус» (кнопка из
 * любого статуса). Новая кнопка выделяется, фокус — на её названии.
 */
export function AddTransitionPopover({
  document: doc,
  defaultFrom,
  trigger,
  onPick,
}: {
  document: WorkflowDraftDocument;
  /** Предвыбранный «Откуда» (панель статуса). */
  defaultFrom?: string;
  trigger: React.ReactNode;
  onPick: (from: string | null, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom ?? '');
  const [to, setTo] = useState('');
  const valid = to !== '' && from !== '' && from !== to;
  const options = doc.stages.map((s) => ({
    value: s.id,
    label: s.name,
    band: ui.automation.bands[s.systemState],
  }));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFrom(defaultFrom ?? '');
          setTo('');
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="nokey flex w-80 flex-col gap-3 rounded-[14px]">
        <span className="text-sm font-medium">{ui.automation.addTransitionTitle}</span>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{ui.automation.fromStage}</span>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="w-full" aria-label={ui.automation.fromStage}>
              <SelectValue placeholder={ui.automation.fromStage} />
            </SelectTrigger>
            <SelectContent position="popper" className="nokey">
              <SelectItem value={ANY}>{ui.automation.anyStatus}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <span className="ml-2 text-xs text-muted-foreground">{option.band}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{ui.automation.toStage}</span>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="w-full" aria-label={ui.automation.toStage}>
              <SelectValue placeholder={ui.automation.toStage} />
            </SelectTrigger>
            <SelectContent position="popper" className="nokey">
              {options
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {ui.common.cancel}
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              setOpen(false);
              onPick(from === ANY ? null : from, to);
            }}
          >
            {ui.automation.addTransitionSubmit}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
