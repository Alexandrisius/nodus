import { useState } from 'react';
import { PROJECT_LIMITS, ui } from '@nodus/contracts';

import { useProjectDetail } from '../api/projects-api.js';
import { useUpdateProject } from '../api/project-mutations.js';

/**
 * Название проекта в хроме слайдера (вердикт владельца 07.11.2026): главное
 * название — рядом с X, в панели не дублируется; правится НА МЕСТЕ кликом,
 * как название задачи (модель Jira/Битрикс24): Enter/blur — сохранить,
 * Esc — отмена. Без права управления — просто текст.
 */
export function ProjectTitle({ projectId }: { projectId: string }) {
  const { data: project } = useProjectDetail(projectId);
  const update = useUpdateProject(projectId);
  const [draft, setDraft] = useState<string | null>(null);

  if (!project) return <>{ui.projects.title}</>;
  if (!project.access.canManage) return <>{project.name}</>;

  function commit() {
    const value = draft?.trim();
    setDraft(null);
    if (value && project && value !== project.name) update.mutate({ body: { name: value } });
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={PROJECT_LIMITS.nameLength}
        aria-label={ui.projects.editTitle}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            // Esc гасит правку, а не закрывает карточку (SliderPanel слушает Esc).
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
          }
        }}
        className="w-[min(60vw,48rem)] max-w-full min-w-0 rounded-md bg-accent/50 px-1.5 text-lg font-semibold text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      title={ui.projects.editTitle}
      onClick={() => setDraft(project.name)}
      className="block max-w-full cursor-text truncate text-left decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:underline"
    >
      {project.name}
    </button>
  );
}
