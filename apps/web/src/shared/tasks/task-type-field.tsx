import { Settings2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { TaskType } from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';
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

import { useAuthStore } from '../auth-store.js';
import { TaskTypeGlyph } from '../workflow/task-type-icon.js';

/**
 * Поле «Тип» экспресс-формы (ADR-0020, #378): создаваемые типы (значок +
 * название) и ⚙ «Настроить типы» — в библиотеку «Автоматизации», только с
 * правом. Из заполненной формы — подтверждение диалогом Nodus (не системным
 * `confirm`): введённое пропадёт.
 */
export function TaskTypeField({
  types,
  value,
  onChange,
  formFilled,
  onLeave,
}: {
  types: readonly TaskType[];
  /** Показанный тип — он же уходит в POST /tasks. */
  value: string;
  onChange: (typeId: string) => void;
  /** В форме есть введённые данные — уход в настройку спрашивает. */
  formFilled: boolean;
  /** Закрыть форму перед переходом в «Автоматизацию». */
  onLeave: () => void;
}) {
  const navigate = useNavigate();
  const canManageTypes = (useAuthStore((s) => s.user?.permissions) ?? []).includes(
    Permission.TASK_WORKFLOW_MANAGE,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const leave = () => {
    setConfirmOpen(false);
    onLeave();
    void navigate({ to: '/automation', search: (prev) => ({ ...prev, tab: 'types' }) });
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={ui.tasks.type} className="min-w-0 flex-1">
          <SelectValue placeholder={ui.tasks.task} />
        </SelectTrigger>
        {/* popper — список ПОД полем, как у соседних пикеров формы
            (ответственный, срок): режим item-aligned клал единственный
            пункт пилюлей прямо поверх значения (фидбек владельца #311). */}
        <SelectContent position="popper" align="start" sideOffset={4}>
          {types.map((t) => (
            <SelectItem key={t.id} value={t.id} className="py-1.5">
              <TaskTypeGlyph icon={t.icon} className="size-3.5 text-muted-foreground" />
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canManageTypes ? (
        <button
          type="button"
          aria-label={ui.tasks.configureTypes}
          title={ui.tasks.configureTypes}
          onClick={() => (formFilled ? setConfirmOpen(true) : leave())}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="size-4" strokeWidth={1.75} />
        </button>
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
