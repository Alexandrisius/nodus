import { ArrowRight } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { formatDate, formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { TaskStatusBadge } from '../../../shared/ui/task-status-badge.js';

/** Блок резолюций документа (модель v2): резолюция — node-панель (автор,
 *  дата, текст), поручения — строки-ссылки на задачи (поручение = задача,
 *  отдельной сущности нет): № моно, текст, исполнитель, срок и ЖИВОЙ статус
 *  задачи (снапшот стадии, синхронизируется при закрытии поручения). */
export function LetterResolutions({ letter }: { letter: LetterDetail }) {
  const openCard = useOpenCard();

  return (
    <>
      <div className="mt-6">
        <NodeLabel label={ui.letters.resolutions} count={letter.resolutions.length} />
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {letter.resolutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ui.common.empty}</p>
        ) : null}
        {letter.resolutions.map((resolution) => (
          <div key={resolution.id} className="node-panel p-3">
            <div className="flex items-center gap-2 text-sm">
              <PersonAvatar name={resolution.author.displayName} className="size-6" />
              <span className="font-medium">{resolution.author.displayName}</span>
              <span className="ml-auto font-mono text-label-sm text-muted-foreground tabular-nums">
                {formatDateTime(resolution.createdAt)}
              </span>
            </div>
            <p className="mt-1.5 text-sm whitespace-pre-wrap">{resolution.text}</p>
            {resolution.instructions.map((instruction) => (
              <button
                key={instruction.id}
                type="button"
                disabled={!instruction.task}
                onClick={() =>
                  instruction.task ? openCard({ kind: 'task', id: instruction.task.id }) : undefined
                }
                className="mt-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/50 disabled:hover:bg-transparent"
              >
                <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                  {instruction.task ? `№ ${instruction.task.number}` : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate">{instruction.text}</span>
                <PersonAvatar name={instruction.assignee.displayName} className="size-5 shrink-0" />
                {instruction.deadline ? (
                  <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                    {formatDate(instruction.deadline)}
                  </span>
                ) : null}
                {instruction.taskStage ? <TaskStatusBadge stage={instruction.taskStage} /> : null}
                {instruction.task ? (
                  <ArrowRight
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
