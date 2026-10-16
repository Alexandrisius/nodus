import { useCommentsCount } from './comments-live.js';

/** Ячейка живого счётчика комментариев (таблицы задач, #252). */
export function CommentsCount({
  task,
  className,
}: {
  task: { id: string; commentsCount: number };
  className?: string;
}) {
  return <span className={className}>{useCommentsCount(task)}</span>;
}
