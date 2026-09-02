import { Link, Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

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
    <div className="absolute inset-0 z-40">
      <SliderPanel
        level={level}
        placement="bottom"
        breadcrumbs={
          params.taskId ? (
            <>
              <span>{ui.tasks.title}</span>
              <span>/</span>
              <span>{ui.tasks.task}</span>
              <span>/</span>
              <span className="text-foreground">{ui.projects.title}</span>
            </>
          ) : (
            <>
              <Link to="/projects" className="hover:text-foreground">
                {ui.projects.title}
              </Link>
              <span>/</span>
              <span className="text-foreground">{ui.projects.title}</span>
            </>
          )
        }
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
    </div>
  );
}
