import { ListChecks, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Textarea } from '@nodus/ui/components/textarea';
import { toast } from 'sonner';

import { useCreateTask, usePersonalStages } from '../api/task-create.js';
import { useUsersList } from '../api/users-list.js';
import { useAuthStore } from '../auth-store.js';
import { DateTimePicker } from '../ui/date-time-picker.js';
import { ProjectPicker } from '../ui/project-picker.js';
import { FilterCombobox } from '../views/filter-combobox.js';
import { TaskChecklistSheet, type DraftChecklistItem } from './task-checklist-sheet.js';

/**
 * Экспресс-форма создания задачи (вердикт владельца 15.09.2026, модель
 * Битрикс24 — но в грамматике Nodus: философию чипов Битрикса НЕ копируем,
 * поля — наши стандартные контролы): название, описание (сворачиваемое),
 * ответственный (по умолчанию — я; из карточки сотрудника — он сам,
 * `defaultAssigneeId`), крайний срок (кастомный DateTimePicker), проект
 * (масштабное окно ProjectPicker), чек-лист (лист поверх формы со
 * смещением вниз, TaskChecklistSheet).
 * В shared/tasks (прецедент shared/chat): потребители — страница задач и
 * карточка сотрудника (cross-feature импорт запрещён, I6).
 * Создание — POST /tasks в первую личную колонку «Моего плана» (глобальная
 * стадия подставляется по её состоянию, как у канбан-плюсика).
 * ФИЛОСОФИЯ (вердикт владельца 15.09.2026): экспресс-форма СОЗДАЁТ задачу
 * и ЗАКРЫВАЕТСЯ (тост «Задача создана») — карточку созданной она НЕ
 * открывает; переход «ввести больше данных» будет отдельной кнопкой
 * «Полная форма», когда полная форма появится (мёртвых кнопок не рисуем).
 */
export function TaskQuickCreate({
  open,
  onOpenChange,
  defaultAssigneeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ответственный по умолчанию (карточка сотрудника — сам сотрудник,
   *  вердикт владельца 15.09.2026); без пропа — текущий пользователь. */
  defaultAssigneeId?: string;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const create = useCreateTask();
  const { data: users } = useUsersList();
  // Первая личная колонка — приёмник новых задач (глобальная «Новые»).
  const { data: personalStages } = usePersonalStages();

  const [title, setTitle] = useState('');
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | undefined>(meId);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [checklist, setChecklist] = useState<DraftChecklistItem[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);

  // Чистая форма при каждом открытии (рендер-тайм сброс по переходу open,
  // канон React, аудит #45); ответственный — defaultAssigneeId или я.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setTitle('');
      setDescriptionOpen(false);
      setDescription('');
      setAssigneeId(defaultAssigneeId ?? meId);
      setDeadline(null);
      setProjectId(undefined);
      setChecklist([]);
      setChecklistOpen(false);
    }
  }

  const valid = title.trim().length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const stage = personalStages?.[0];
    if (!valid || create.isPending || !stage) return;
    create.mutate(
      {
        title: title.trim(),
        personalStageId: stage.id,
        ...(projectId ? { projectId } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(deadline ? { deadline: deadline.toISOString() } : {}),
        ...(checklist.length > 0 ? { checklist: checklist.map((i) => i.text) } : {}),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(ui.tasks.created);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Крестик — по центру строки названия (h-10 + p-4 = центр 36px) и
          НЕ наползает на поле (вердикт владельца 15.09.2026: «уехала»);
          полю — pr-10 под него. */}
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0 [&_[data-slot=dialog-close]]:top-[22px] [&_[data-slot=dialog-close]]:right-4"
        aria-describedby={undefined}
        // Esc закрывает ЛИСТ чек-листа, а не всю форму (вердикт владельца
        // 15.09.2026): официальный гейт Radix — preventDefault на уровне
        // Content, пока лист открыт.
        onEscapeKeyDown={(e) => {
          if (checklistOpen) {
            e.preventDefault();
            setChecklistOpen(false);
          }
        }}
      >
        <DialogTitle className="sr-only">{ui.tasks.createTask}</DialogTitle>
        <form onSubmit={submit} className="relative flex max-h-[80vh] flex-col">
          <div className="flex flex-col gap-3 overflow-y-auto p-4 pb-3">
            {/* Крестик — ВНЕ поля названия (вердикт владельца 15.09.2026,
                реф Битрикс24: X в углу диалога, не «очистка textbox»):
                поле УЖЕ на резерв 40px, X живёт в освобождённом углу. */}
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ui.tasks.titlePlaceholder}
              aria-label={ui.tasks.titlePlaceholder}
              className="h-10 w-[calc(100%-2.5rem)] text-base"
              autoFocus
            />
            {descriptionOpen ? (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={ui.tasks.description}
                aria-label={ui.tasks.description}
                rows={3}
                className="text-sm"
              />
            ) : (
              <button
                type="button"
                onClick={() => setDescriptionOpen(true)}
                className="flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                {ui.tasks.addDescription}
              </button>
            )}
            <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-2.5">
              <NodeLabel label={ui.tasks.assignee} />
              <FilterCombobox
                options={(users?.items ?? []).map((u) => ({
                  value: u.id,
                  label: u.displayName,
                  avatarUrl: u.avatarUrl ?? null,
                }))}
                value={assigneeId}
                onChange={setAssigneeId}
                ariaLabel={ui.tasks.assignee}
              />
              <NodeLabel label={ui.tasks.deadline} />
              <DateTimePicker
                value={deadline}
                onChange={setDeadline}
                ariaLabel={ui.tasks.deadline}
              />
              <NodeLabel label={ui.tasks.project} />
              <ProjectPicker
                value={projectId}
                onChange={setProjectId}
                ariaLabel={ui.tasks.project}
              />
              <NodeLabel label={ui.tasks.checklist} />
              <button
                type="button"
                onClick={() => setChecklistOpen(true)}
                className="flex h-8 w-fit items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ListChecks className="size-3.5" strokeWidth={1.75} />
                {checklist.length > 0 ? (
                  <span className="font-mono text-[11px] tabular-nums">{checklist.length}</span>
                ) : null}
                {ui.tasks.checklist}
              </button>
            </div>
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border px-4">
            <Button size="sm" type="submit" disabled={!valid || create.isPending}>
              {ui.common.create}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              {ui.common.cancel}
            </Button>
          </div>
          {checklistOpen ? (
            <TaskChecklistSheet
              items={checklist}
              onChange={setChecklist}
              onClose={() => setChecklistOpen(false)}
            />
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
