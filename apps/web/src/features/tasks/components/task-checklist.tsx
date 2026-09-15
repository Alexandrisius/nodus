import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useAddChecklistItem, useToggleChecklistItem } from '../api/checklist-api.js';

/**
 * Чек-лист задачи — сразу после полей, ДО подзадач (вердикт владельца
 * 15.09.2026: «чек-листам нужно выделить важное место»): прогресс линией,
 * ЖИВЫЕ отметки (оптимистично, I4), добавление пунктов. Секция видна
 * всегда — пустая приглашает добавить первый пункт.
 */
export function TaskChecklist({ task }: { task: TaskDetail }) {
  const addItem = useAddChecklistItem(task.id);
  const toggleItem = useToggleChecklistItem(task.id);
  const [text, setText] = useState('');

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || addItem.isPending) return;
    setText('');
    addItem.mutate(value);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <NodeLabel label={ui.tasks.checklist} count={task.checklist.length} />
        {task.checklistTotal > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {task.checklistDone}/{task.checklistTotal} {ui.tasks.checklistDoneLabel}
          </span>
        ) : null}
      </div>
      {task.checklistTotal > 0 ? (
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{
              width: `${Math.round((task.checklistDone / task.checklistTotal) * 100)}%`,
            }}
          />
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-col gap-2">
        {task.checklist.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={item.done}
              onCheckedChange={(value) =>
                toggleItem.mutate({ itemId: item.id, done: value === true })
              }
            />
            <span className={item.done ? 'text-muted-foreground line-through' : ''}>
              {item.text}
            </span>
          </label>
        ))}
      </div>
      <form onSubmit={onAdd} className="mt-2 flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ui.tasks.checklistAdd}
          className="h-8 text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label={ui.tasks.checklistAdd}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </form>
    </div>
  );
}
