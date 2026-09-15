import type { LetterStatus } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

/** Тон статуса письма: незарегистрированное — предупреждение (очередь),
 *  в работе — info, исполнено — success, просрочено — danger (I15: ключи
 *  палитры темы, не hex). */
const tone: Record<LetterStatus, 'warning' | 'info' | 'success' | 'danger'> = {
  unregistered: 'warning',
  in_work: 'info',
  done: 'success',
  overdue: 'danger',
};

export function LetterStatusBadge({
  status,
  className,
}: {
  status: LetterStatus;
  className?: string;
}) {
  return (
    <NodeChip tone={tone[status]} className={cn('shrink-0', className)}>
      {ui.letters.status[status]}
    </NodeChip>
  );
}
