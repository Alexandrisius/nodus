import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { useShellStore } from '../../../app/shell/shell-store.js';
import { TaskCard } from '../components/task-card.js';

/** Слайдер карточки задачи: свой URL, ESC закрывает, стек до проекта.
 * Источник раскрытия — rect строки/карточки, по которой кликнули (lastSource
 * фиксируется на маунте и сбрасывается, чтобы прямые ссылки были scale-fade).
 * Хлебных крошек нет (вердикт владельца): название — один раз в карточке. */
export function TaskSliderPage() {
  const { taskId } = useParams({ strict: false }) as { taskId: string };
  const navigate = useNavigate();
  const [source] = useState(() => useShellStore.getState().lastSource);

  useEffect(() => {
    useShellStore.getState().setLastSource(null);
  }, []);

  return (
    <>
      <SliderPanel
        onClose={() => void navigate({ to: '/tasks', search: (prev) => prev })}
        sourceRect={source ?? undefined}
        fadeContent={false}
      >
        <TaskCard taskId={taskId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
