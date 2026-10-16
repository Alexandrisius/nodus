import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Textarea } from '@nodus/ui/components/textarea';

import { useUpdateTask } from '../api/task-edit-api.js';

/** Описание задачи — правка на месте (модель Jira): клик по тексту
 *  открывает поле, Ctrl+Enter — сохранить, Esc — отмена. Пустое описание
 *  приглашает «Добавить описание»; без права правки — только текст. */
export function TaskDescription({ task }: { task: TaskDetail }) {
  const update = useUpdateTask(task.id);
  const [draft, setDraft] = useState<string | null>(null);
  const canEdit = task.access.canEdit;

  function save() {
    if (draft === null) return;
    const value = draft.trim();
    setDraft(null);
    if (value !== task.description) update.mutate({ description: value });
  }

  if (draft !== null) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          autoFocus
          value={draft}
          maxLength={5000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            }
          }}
          placeholder={ui.tasks.descriptionPlaceholder}
          aria-label={ui.tasks.description}
          className="min-h-24 text-sm leading-relaxed [field-sizing:content]"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save}>
            {ui.common.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            {ui.common.cancel}
          </Button>
        </div>
      </div>
    );
  }

  if (!task.description) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
        {ui.tasks.addDescription}
      </button>
    ) : null;
  }

  return canEdit ? (
    <button
      type="button"
      onClick={() => setDraft(task.description)}
      className="-mx-2 block w-[calc(100%+1rem)] cursor-text rounded-md px-2 py-1 text-left text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 transition-colors hover:bg-accent/40"
    >
      {task.description}
    </button>
  ) : (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
      {task.description}
    </p>
  );
}
