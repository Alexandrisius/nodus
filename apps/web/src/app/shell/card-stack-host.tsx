import { useEffect, useState } from 'react';
import { ui } from '@nodus/contracts';

import { ProjectIdentityIcon } from '../../shared/ui/project-identity-icon.js';
import { useLetterDetail } from '../../features/correspondence/api/letters-api.js';
import { LetterCard } from '../../features/correspondence/components/letter-card.js';
import { MessengerBody, type ChatTab } from '../../features/chat/components/messenger-body.js';
import { MessengerTabs } from '../../features/chat/components/messenger-tabs.js';
import { useUsersList } from '../../features/directory/api/directory-api.js';
import { EmployeeCard } from '../../features/directory/components/employee-card.js';
import { useProjectDetail } from '../../features/projects/api/projects-api.js';
import { ProjectCard } from '../../features/projects/components/project-card.js';
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
    <SliderPanel
      title={
        project ? (
          <span className="flex min-w-0 items-center gap-2">
            <ProjectIdentityIcon color={project.color} />
            <span className="truncate">{project.name}</span>
          </span>
        ) : (
          ui.projects.title
        )
      }
      onClose={onClose}
      sourceRect={source}
      fadeContent={false}
    >
      <ProjectCard projectId={id} />
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
      fadeContent={false}
    >
      <EmployeeCard userId={id} />
    </SliderPanel>
  );
}

/** Мессенджер — ПОЛНОЭКРАННАЯ карточка стека (ADR-0009 + план
 *  `docs/mvp/messenger-fullscreen-plan.md`, вердикт владельца 15.09.2026,
 *  модель Битрикс24): клик по беседе в служебной полосе открывает
 *  полноценный мессенджер (вкладки Чаты/Чаты задач/Настройка, список бесед,
 *  весь функционал — единое тело `MessengerBody` со страницей /chat) ПОВЕРХ
 *  текущей карточки; полоса под карточкой НАКРЫТА ею (inset-2 периметра —
 *  дубль списка невидим и недоступен; скрывать полосу шеллом НЕЛЬЗЯ: карточки
 *  под верхней поехали бы на 40px во время раскрытия — баг-вердикт владельца
 *  15.09.2026), закрытие (X/Esc) возвращает к предыдущей сущности с её
 *  состоянием. id — беседа, выбранная при открытии; подмена верхней
 *  карточки (клик по другой беседе полосы) меняет id БЕЗ ремаунта панели —
 *  синхронизация эффектом. Вкладка и тред — локальное состояние (чужие
 *  маршруту search-параметры не пишем). */
function MessengerEntry({ id, source, onClose }: EntryProps) {
  const [conversationId, setConversationId] = useState(id);
  const [tab, setTab] = useState<ChatTab>('chats');
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  // Подмена беседы (replaceTop): сброс треда — он принадлежал прежней беседе
  // (рендер-тайм сброс по смене id, канон React, аудит #45).
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setConversationId(id);
    setThreadRootId(null);
  }
  return (
    <SliderPanel
      cardTopbar
      fullscreen
      headerContent={<MessengerTabs tab={tab} onChange={setTab} />}
      onClose={onClose}
      sourceRect={source}
      fadeContent={false}
    >
      <MessengerBody
        tab={tab}
        conversationId={conversationId}
        onSelectConversation={setConversationId}
        threadRootId={threadRootId}
        onOpenThread={setThreadRootId}
        onCloseThread={() => setThreadRootId(null)}
      />
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
    case 'messenger':
      return <MessengerEntry id={cardRef.id} source={source} onClose={onClose} />;
  }
}

export function CardStackHost() {
  const stack = useCardStack();
  const closeCard = useCloseCard();
  return stack.map((cardRef, index) => (
    // index+kind в ключе (без id): одна сущность может встречаться в стеке
    // дважды (цепочка задача → подзадача); замена верхней (режим «Навигация»
    // ветки, useReplaceTopCard) подменяет id БЕЗ ремаунта панели — карточка
    // стоит на месте, меняется только содержимое.
    <CardStackEntry key={`${index}:${cardRef.kind}`} cardRef={cardRef} onClose={closeCard} />
  ));
}
