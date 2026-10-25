import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { formatDateTime, withoutPatronymic } from '../../lib/format.js';
import { TaskResultView } from '../../tasks/task-result-view.js';
import { PersonAvatar } from '../../ui/person-avatar.js';
import type { WindowSubmission } from './window-context.js';

/**
 * «Что сдаёт исполнитель» (#380): только чтение — текст итога, файлы
 * миниатюрами и сообщения. Сверху окна у утверждающего: он видит, что
 * утверждает (боль Битрикса «жали не глядя»). Список сдач 1..N — задел
 * #434: в #380 одна карточка текущей ревизии.
 */
export function SubmissionBlock({
  submission,
  conversationId,
}: {
  submission: WindowSubmission;
  conversationId: string | null;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <NodeLabel label={ui.tasks.window.whatExecutorSubmits} />
      <TaskResultView result={submission.result} conversationId={conversationId} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <PersonAvatar
          name={submission.author.displayName}
          avatarUrl={submission.author.avatarUrl}
          className="size-4"
        />
        {withoutPatronymic(submission.author.displayName)} · {formatDateTime(submission.createdAt)}
      </p>
    </section>
  );
}
