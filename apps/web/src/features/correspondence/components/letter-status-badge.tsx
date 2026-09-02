import type { LetterStatus } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Badge } from '@nodus/ui/components/badge';

const tone: Record<LetterStatus, string> = {
  unregistered: 'bg-secondary text-secondary-foreground',
  in_work: 'bg-info-soft text-info',
  done: 'bg-success-soft text-success',
  overdue: 'bg-danger-soft text-danger',
};

export function LetterStatusBadge({ status }: { status: LetterStatus }) {
  return (
    <Badge variant="secondary" className={`h-6 ${tone[status]}`}>
      {ui.letters.status[status]}
    </Badge>
  );
}
