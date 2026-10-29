import { Plus } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { PeoplePicker } from '../../../shared/ui/people-picker.js';
import { useAddProjectMember, useRemoveProjectMember } from '../api/project-member-mutations.js';

/**
 * Добавление состава проекта (вердикт владельца 07.11.2026): клик по тихой
 * кнопке СРАЗУ открывает поповер с поиском и множественным выбором — без
 * инлайн-формы, которая «дёргала» верстку новыми элементами. Выбранный
 * человек добавляется сразу, повторный клик — снимает (та же модель, что у
 * полей «Помощники/Наблюдатели»). В открытом проекте — только наблюдатели
 * (участники живут из задач), в секретном — и участники, и наблюдатели.
 */
export function AddProjectMemberButton({
  projectId,
  kind,
  selectedIds,
  excludeIds,
}: {
  projectId: string;
  kind: 'member' | 'observer';
  /** Уже добавленные этим видом — галочки в списке и снятие по клику. */
  selectedIds: readonly string[];
  /** Руководство наблюдателем/участником не бывает — его в списке нет. */
  excludeIds: readonly string[];
}) {
  const add = useAddProjectMember(projectId);
  const remove = useRemoveProjectMember(projectId);
  const label = kind === 'observer' ? ui.projects.addObserver : ui.projects.addMember;

  return (
    <PeoplePicker
      multiple
      selectedIds={selectedIds}
      excludeIds={excludeIds}
      ariaLabel={label}
      onToggle={(userId) => {
        if (selectedIds.includes(userId)) remove.mutate({ userId, kind });
        else add.mutate({ userId, kind });
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
        {label}
      </Button>
    </PeoplePicker>
  );
}
