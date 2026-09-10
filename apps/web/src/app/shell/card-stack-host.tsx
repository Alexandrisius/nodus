import { useEffect, useState } from 'react';
import { ui } from '@nodus/contracts';

import { useLetterDetail } from '../../features/correspondence/api/letters-api.js';
import { LetterCard } from '../../features/correspondence/components/letter-card.js';
import { useUsersList } from '../../features/directory/api/directory-api.js';
import { EmployeeCard } from '../../features/directory/components/employee-card.js';
import { useProjectDetail } from '../../features/projects/api/projects-api.js';
import { ProjectPanel } from '../../features/projects/components/project-panel.js';
import { useTaskDetail } from '../../features/tasks/api/tasks-api.js';
import { TaskCard } from '../../features/tasks/components/task-card.js';
import type { CardRef } from './card-stack.js';
import { SliderPanel, type SourceRect } from './slider-panel.js';
import { useShellStore } from './shell-store.js';
import { useCardStack, useCloseCard } from './use-card-stack.js';

/**
 * Хост стека карточек сущностей (ADR-0009): читает стек из `?cards=` и
 * рендерит слайдеры ПО ПОРЯДКУ стека (DOM-порядок = z-порядок: верхняя
 * карточка последняя). Нижние карточки остаются смонтированными — закрытие
 * верхней возвращает к прежней с целым состоянием (скролл, вкладки, черновики).
 *
 * Все карточки — EAGER-импорты (не lazy-чанки): карточка — центральный экран
 * продукта и открывается из любого раздела, поэтому загрузка их кода платится
 * один раз на старте приложения, а открытие мгновенно у всех сущностей
 * (вердикт владельца: «как карточки задач — без прогрузки и фризов»).
 */

interface EntryProps {
  id: string;
  source: SourceRect | undefined;
  onClose: () => void;
}

function TaskEntry({ id, source, onClose }: EntryProps) {
  const { data: task } = useTaskDetail(id);
  return (
    <SliderPanel
      title={task?.title ?? ui.tasks.task}
      onClose={onClose}
      sourceRect={source}
      fadeContent={false}
    >
      <TaskCard taskId={id} />
    </SliderPanel>
  );
}

function ProjectEntry({ id, source, onClose }: EntryProps) {
  const { data: project } = useProjectDetail(id);
  return (
    <SliderPanel title={project?.name ?? ui.projects.title} onClose={onClose} sourceRect={source}>
      <ProjectPanel projectId={id} />
    </SliderPanel>
  );
}

function LetterEntry({ id, source, onClose }: EntryProps) {
  const { data: letter } = useLetterDetail(id);
  return (
    <SliderPanel title={letter?.subject ?? ui.letters.letter} onClose={onClose} sourceRect={source}>
      <LetterCard letterId={id} />
    </SliderPanel>
  );
}

function EmployeeEntry({ id, source, onClose }: EntryProps) {
  const { data } = useUsersList();
  const user = data?.items.find((u) => u.id === id);
  return (
    <SliderPanel
      title={user?.displayName ?? ui.employees.title}
      onClose={onClose}
      sourceRect={source}
    >
      <EmployeeCard userId={id} />
    </SliderPanel>
  );
}

/** Один слайдер стека: rect источника потребляется на маунте (FLIP-раскрытие
 *  из строки/карточки, по которой кликнули); восстановленные из URL (F5,
 *  прямая ссылка) раскрываются сдержанным scale-fade. */
function CardStackEntry({ cardRef, onClose }: { cardRef: CardRef; onClose: () => void }) {
  const [source] = useState(() => useShellStore.getState().lastSource ?? undefined);
  useEffect(() => {
    useShellStore.getState().setLastSource(null);
  }, []);

  switch (cardRef.kind) {
    case 'task':
      return <TaskEntry id={cardRef.id} source={source} onClose={onClose} />;
    case 'project':
      return <ProjectEntry id={cardRef.id} source={source} onClose={onClose} />;
    case 'letter':
      return <LetterEntry id={cardRef.id} source={source} onClose={onClose} />;
    case 'employee':
      return <EmployeeEntry id={cardRef.id} source={source} onClose={onClose} />;
  }
}

export function CardStackHost() {
  const stack = useCardStack();
  const closeCard = useCloseCard();
  return stack.map((cardRef, index) => (
    // index в ключе: одна сущность может встречаться в стеке дважды
    // (цепочка задача → подзадача); стек меняется только с вершины.
    <CardStackEntry
      key={`${cardRef.kind}:${cardRef.id}:${index}`}
      cardRef={cardRef}
      onClose={closeCard}
    />
  ));
}
