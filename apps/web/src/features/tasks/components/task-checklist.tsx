import { Plus, X } from 'lucide-react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useToggleChecklistItem,
} from '../api/checklist-api.js';
import { isTempId } from '../lib/temp-records.js';
import { InlineAddRow } from './inline-add-row.js';

/**
 * Чек-лист задачи — сразу после полей, ДО подзадач (вердикт владельца
 * 15.09.2026: «чек-листам — важное место»). Плотные строки h-8 (#311,
 * вердикт «огромные широкие пункты»): галочка, текст, крестик удаления по
 * ховеру; прогресс — короткой линией у заголовка; добавление — строкой в
 * самом списке (Enter — следующий пункт, Esc — выйти), без поля-«кирпича».
 * Состав правит canEdit, отмечает canCheck (соисполнители тоже).
 */
export function TaskChecklist({ task }: { task: TaskDetail }) {
  const addItem = useAddChecklistItem(task.id);
  const toggleItem = useToggleChecklistItem(task.id);
  const deleteItem = useDeleteChecklistItem(task.id);
  const { canEdit, canCheck } = task.access;
  const total = task.checklistTotal;

  if (total === 0 && !canEdit) return null;

  return (
    <section className="mt-7">
      <div className="flex h-7 items-center gap-3">
        <NodeLabel label={ui.tasks.checklist} />
        {total > 0 ? (
          <>
            <span className="font-mono text-label-sm text-muted-foreground tabular-nums">
              {task.checklistDone}/{total}
            </span>
            <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-success transition-[width] duration-300"
                style={{ width: `${Math.round((task.checklistDone / total) * 100)}%` }}
              />
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-1 flex flex-col">
        {task.checklist.map((item) => {
          // Темп-пункт (летит POST): серверного id ещё нет — PATCH/DELETE на
          // temp-id дали бы 404; отметка и удаление — после подтверждения.
          const pending = isTempId(item.id);
          return (
            <div
              key={item.id}
              className="group/item -mx-2 flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 transition-colors hover:bg-accent/40"
            >
              <Checkbox
                checked={item.done}
                disabled={!canCheck || pending}
                aria-label={item.text}
                onCheckedChange={(value) => {
                  if (pending) return;
                  toggleItem.mutate({ itemId: item.id, done: value === true });
                }}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm',
                  item.done && 'text-muted-foreground line-through',
                )}
              >
                {item.text}
              </span>
              {canEdit && !pending ? (
                <button
                  type="button"
                  onClick={() => deleteItem.mutate({ itemId: item.id })}
                  aria-label={ui.tasks.checklistDelete}
                  title={ui.tasks.checklistDelete}
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          );
        })}
        {canEdit ? (
          <InlineAddRow
            label={ui.tasks.checklistAdd}
            icon={<Plus className="size-3.5" strokeWidth={1.75} />}
            maxLength={300}
            onAdd={(text) => addItem.mutate({ text, tempId: `temp-${crypto.randomUUID()}` })}
          />
        ) : null}
      </div>
    </section>
  );
}
