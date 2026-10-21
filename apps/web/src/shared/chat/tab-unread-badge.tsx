import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

/** Число непрочитанных на вкладке мессенджера (#409): ТОТ ЖЕ прямоугольный
 *  счётчик, что в строке беседы (`NodeChip tone="danger"`, conversation-list) —
 *  никаких новых «пилюль»/заливок: одна грамматика счётчиков в продукте.
 *  Больше 99 — «99+». Ноль не рендерится. */
export function TabUnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <NodeChip tone="danger" className={cn('ml-1.5 shrink-0', className)}>
      {count > 99 ? '99+' : count}
    </NodeChip>
  );
}
