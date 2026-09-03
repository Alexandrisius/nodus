import { Link, Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { TaskCard } from '../components/task-card.js';

/** Слайдер карточки задачи: свой URL, ESC закрывает, стек до проекта. */
export function TaskSliderPage() {
  const { taskId } = useParams({ strict: false }) as { taskId: string };
  const navigate = useNavigate();

  return (
    <>
      <SliderPanel
        breadcrumbs={
          <>
            <Link to="/tasks" className="hover:text-foreground">
              {ui.tasks.title}
            </Link>
            <span>/</span>
            <span className="truncate text-foreground">{ui.tasks.task}</span>
          </>
        }
        onClose={() => void navigate({ to: '/tasks' })}
      >
        <TaskCard taskId={taskId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
