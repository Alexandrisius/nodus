import { ListTodo, Plus } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@nodus/ui/components/empty';
import { cn } from '@nodus/ui/lib/utils';

/** Первый вход в «Задачи» без единой задачи (#311, вопрос владельца
 *  «пустой канбан — best practice?»): по NN/g пустое состояние объясняет,
 *  ЧТО здесь будет и даёт главное действие. Доска остаётся видна под
 *  карточкой (структура колонок понятна сразу), поверх — пояснение и
 *  «Создать задачу». С первой задачей карточка исчезает сама. */
export function TasksEmpty({ onCreate, className }: { onCreate: () => void; className?: string }) {
  return (
    <Empty
      className={cn('max-w-md flex-none rounded-2xl border border-border bg-card p-8', className)}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListTodo strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle className="text-base">{ui.tasks.boardEmptyTitle}</EmptyTitle>
        <EmptyDescription>{ui.tasks.boardEmptyText}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate}>
          <Plus data-icon="inline-start" />
          {ui.tasks.createTask}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
