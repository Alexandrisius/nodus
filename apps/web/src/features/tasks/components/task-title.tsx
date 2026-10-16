import { useState } from 'react';
import { ui } from '@nodus/contracts';

import { useTaskDetail } from '../api/tasks-api.js';
import { useUpdateTask } from '../api/task-edit-api.js';

/** Название задачи в хроме слайдера (вердикт владельца: главное название —
 *  рядом с X, в теле не дублируется) — правится на месте кликом (модель
 *  Jira/Битрикс24): Enter/blur — сохранить, Esc — отмена. Без права правки —
 *  просто текст. */
export function TaskTitle({ taskId }: { taskId: string }) {
  const { data: task } = useTaskDetail(taskId);
  const update = useUpdateTask(taskId);
  const [draft, setDraft] = useState<string | null>(null);

  if (!task) return <>{ui.tasks.task}</>;
  if (!task.access.canEdit) return <>{task.title}</>;

  function commit() {
    const value = draft?.trim();
    setDraft(null);
    if (value && task && value !== task.title) update.mutate({ title: value });
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={200}
        aria-label={ui.tasks.editTitle}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            // Esc гасит правку, а не закрывает карточку (SliderPanel слушает Esc).
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
        className="-mx-1.5 w-full min-w-0 rounded-md bg-accent/50 px-1.5 text-lg font-semibold text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      title={ui.tasks.editTitle}
      onClick={() => setDraft(task.title)}
      className="-mx-1.5 max-w-full cursor-text truncate rounded-md px-1.5 text-left transition-colors hover:bg-accent/50"
    >
      {task.title}
    </button>
  );
}
