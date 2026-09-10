import { Outlet, useNavigate, useParams } from '@tanstack/react-router';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { ProjectPanel } from '../components/project-panel.js';

/**
 * Слайдер проекта: уровень 1 из «Проекты», уровень 2 — поверх карточки задачи
 * (стек «Задача → Проект», §10.2).
 */
export function ProjectSliderPage() {
  const params = useParams({ strict: false }) as { projectId: string; taskId?: string };
  const navigate = useNavigate();
  const level = params.taskId ? 2 : 1;

  return (
    <>
      <SliderPanel
        level={level}
        onClose={() =>
          void navigate(
            params.taskId
              ? { to: '/tasks/$taskId', params: { taskId: params.taskId } }
              : { to: '/projects' },
          )
        }
      >
        <ProjectPanel projectId={params.projectId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
