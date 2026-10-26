import { Settings2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ProcessType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';

import { ProcessTypeGlyph } from '../workflow/process-type-icon.js';

/**
 * Поле «Тип задачи» окна создания (#432, ADR-0020): доступные для создания
 * типы (значок + название) и ⚙ «Настройки типа» — переход в «Автоматизацию»
 * к ЭТОМУ типу, только с правом `workflow.manage`. ⚙ — кнопка-иконка того же
 * габарита, что крестик в строке названия: обе стоят в одной колонке, поле
 * типа кончается ровно там же, где поле названия. Из заполненного окна —
 * подтверждение диалогом Nodus (не системным `confirm`): введённое пропадёт.
 */
export function ProcessTypeField({
  types,
  value,
  disabled,
  showSettings,
  dirty,
  onChange,
  onLeave,
}: {
  types: readonly ProcessType[];
  /** Показанный тип — он же уходит в POST /tasks. */
  value: string;
  disabled: boolean;
  /** ⚙ «Настройки типа» (право `workflow.manage`, не предпросмотр). */
  showSettings: boolean;
  /** В окне есть введённые данные — уход в настройку спрашивает. */
  dirty: boolean;
  onChange: (typeId: string) => void;
  /** Закрыть окно перед переходом в «Автоматизацию». */
  onLeave: () => void;
}) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shown = types.find((type) => type.id === value);

  const leave = () => {
    setConfirmOpen(false);
    onLeave();
    void navigate({ to: '/automation', search: { tab: 'processes', type: value } });
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 min-w-0 flex-1" aria-label={ui.taskCreate.typeLabel}>
          <SelectValue placeholder={ui.taskCreate.noTypes}>
            {shown ? (
              <span className="flex min-w-0 items-center gap-2">
                <ProcessTypeGlyph icon={shown.icon} className="size-3.5 shrink-0" />
                <span className="truncate">{shown.name}</span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        {/* popper — список ПОД полем, как у соседних пикеров формы
            (фидбек владельца #311: item-aligned клал пункт поверх значения). */}
        <SelectContent position="popper" className="nokey">
          {types.map((type) => (
            <SelectItem key={type.id} value={type.id}>
              <span className="flex items-center gap-2">
                <ProcessTypeGlyph icon={type.icon} className="size-3.5 text-muted-foreground" />
                {type.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showSettings && shown ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={ui.taskCreate.typeSettings}
          title={ui.taskCreate.typeSettings}
          onClick={() => (dirty ? setConfirmOpen(true) : leave())}
        >
          <Settings2 className="size-4" strokeWidth={1.75} />
        </Button>
      ) : null}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui.tasks.leaveFormTitle}</DialogTitle>
            <DialogDescription>{ui.tasks.leaveFormText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {ui.tasks.leaveFormStay}
            </Button>
            <Button onClick={leave}>{ui.tasks.leaveFormGo}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
