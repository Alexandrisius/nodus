import { useEffect, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { ProjectIdentityIcon } from '../../shared/ui/project-identity-icon.js';
import { useLetterDetail } from '../../features/correspondence/api/letters-api.js';
import { LetterCard } from '../../features/correspondence/components/letter-card.js';
import { useConversations } from '../../features/chat/api/chat-api.js';
import { ChatWorkspace } from '../../features/chat/components/chat-workspace.js';
import { conversationTitle, isNotesConversation } from '../../features/chat/lib/conversations.js';
import { useUsersList } from '../../features/directory/api/directory-api.js';
import { EmployeeCard } from '../../features/directory/components/employee-card.js';
import { useProjectDetail } from '../../features/projects/api/projects-api.js';
import { ProjectCard } from '../../features/projects/components/project-card.js';
import { useTaskDetail } from '../../features/tasks/api/tasks-api.js';
import { TaskCard } from '../../features/tasks/components/task-card.js';
import { useAuthStore } from '../../shared/auth-store.js';
import { NotesGlyph } from '../../shared/ui/notes-glyph.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
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

/** Беседа — полноправная сущность стека (ADR-0009, вердикт владельца
 *  14.09.2026): чат открывается ПОВЕРХ текущей карточки (задачи и т.п.),
 *  не закрывая её; Esc снимает чат и возвращает к задаче с состоянием.
 *  Треды карточки — локальное состояние (search маршрута не трогаем). */
function ChatEntry({ id, source, onClose }: EntryProps) {
  const { data, isLoading, isFetching } = useConversations();
  const meId = useAuthStore((s) => s.user?.id);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const conversation = data?.items.find((c) => c.id === id);
  return (
    <SliderPanel
      title={
        conversation ? (
          <span className="flex min-w-0 items-center gap-2">
            {isNotesConversation(conversation, meId) ? (
              <NotesGlyph className="size-6 shrink-0" />
            ) : (
              <PersonAvatar
                name={conversationTitle(conversation, meId)}
                avatarUrl={conversation.avatarUrl}
                className="size-6 shrink-0"
              />
            )}
            <span className="truncate">{conversationTitle(conversation, meId)}</span>
          </span>
        ) : (
          ui.chat.notes
        )
      }
      onClose={onClose}
      sourceRect={source}
      fadeContent={false}
    >
      {conversation ? (
        <ChatWorkspace
          conversation={conversation}
          compact
          threadRootId={threadRootId}
          onOpenThread={setThreadRootId}
          onCloseThread={() => setThreadRootId(null)}
        />
      ) : isLoading || isFetching ? (
        <div className="flex h-full flex-col gap-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="w-full flex-1" />
        </div>
      ) : null}
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
    case 'chat':
      return <ChatEntry id={cardRef.id} source={source} onClose={onClose} />;
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
