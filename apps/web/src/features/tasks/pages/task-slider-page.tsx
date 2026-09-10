import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { useShellStore } from '../../../app/shell/shell-store.js';
import { useTaskDetail } from '../api/tasks-api.js';
import { TaskCard } from '../components/task-card.js';

/** Слайдер карточки задачи: свой URL, ESC закрывает, стек до проекта.
 *  Два направления стека (§10.2): «Задача → Проект» (/tasks/$taskId/…) —
 *  уровень 1; «Проект → Задача» (/projects/$projectId/task/$taskId, список/
 *  канбан проектной панели) — уровень 2, закрытие возвращает в проект.
 *  Источник раскрытия — rect строки/карточки, по которой кликнули (lastSource
 *  фиксируется на маунте и сбрасывается, чтобы прямые ссылки были scale-fade).
 *  Название — в хроме слайдера (вердикт владельца), в теле не дублируется. */
export function TaskSliderPage() {
  const params = useParams({ strict: false }) as { taskId: string; projectId?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const underProject = pathname.startsWith('/projects');
  const navigate = useNavigate();
  const [source] = useState(() => useShellStore.getState().lastSource);
  const { data: task } = useTaskDetail(params.taskId);

  useEffect(() => {
    useShellStore.getState().setLastSource(null);
  }, []);

  return (
    <>
      <SliderPanel
        level={underProject ? 2 : 1}
        title={task?.title ?? ui.tasks.task}
        onClose={() =>
          void navigate(
            underProject && params.projectId
              ? { to: '/projects/$projectId', params: { projectId: params.projectId } }
              : { to: '/tasks', search: (prev) => prev },
          )
        }
        sourceRect={source ?? undefined}
        fadeContent={false}
      >
        <TaskCard taskId={params.taskId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
