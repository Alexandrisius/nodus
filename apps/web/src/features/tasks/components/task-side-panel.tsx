import { FileText, History, Link2, MessageSquare, Star } from 'lucide-react';
import { useState } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useTaskMessages } from '../api/tasks-api.js';
import { TaskDiscussion } from './task-discussion.js';

type TabId = 'discussion' | 'files' | 'links' | 'history';

function EmptyNote() {
  return <p className="p-4 text-sm text-muted-foreground">{ui.common.empty}</p>;
}

/**
 * Правая панель карточки задачи: участники + быстрая навигация по обсуждению
 * (обсуждение / файлы и медиа / ссылки / история) — референс-рельс
 * Телеграм/Битрикс, но узкий (400px задаёт карточка): контент переключается
 * прямо в панели, без отдельной широкой колонки чата.
 */
export function TaskSidePanel({ task }: { task: TaskDetail }) {
  const { data } = useTaskMessages(task.id);
  const [tab, setTab] = useState<TabId>('discussion');
  const [favorite, setFavorite] = useState(false);

  const messages = data?.items ?? [];
  const files = messages.flatMap((m) => m.attachments);
  const links = [task.description, ...messages.map((m) => m.text)].flatMap(
    (text) => text.match(/https?:\/\/\S+/g) ?? [],
  );
  const people = [
    ...new Map(
      [task.creator, ...(task.assignee ? [task.assignee] : []), ...task.observers].map((p) => [
        p.id,
        p,
      ]),
    ).values(),
  ];

  const tabs: { id: TabId; icon: typeof Star; label: string; count?: number }[] = [
    { id: 'discussion', icon: MessageSquare, label: ui.tasks.discussion, count: messages.length },
    { id: 'files', icon: FileText, label: ui.tasks.filesMedia, count: files.length },
    { id: 'links', icon: Link2, label: ui.tasks.links, count: links.length },
    { id: 'history', icon: History, label: ui.tasks.history },
  ];

  return (
    <aside className="flex min-h-0 flex-col border-l border-border">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex -space-x-1.5">
            {people.slice(0, 4).map((person) => (
              <PersonAvatar
                key={person.id}
                name={person.displayName}
                className="size-6 ring-2 ring-card"
              />
            ))}
          </div>
          {people.length > 4 ? (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              +{people.length - 4}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setFavorite((v) => !v)}
          aria-label={ui.tasks.favorite}
          className={cn(
            'rounded-lg p-1.5 hover:bg-accent',
            favorite ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          <Star className={cn('size-4.5', favorite && 'fill-current')} />
        </button>
      </div>

      <div className="flex shrink-0 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            title={t.label}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 transition-colors',
              tab === t.id
                ? 'border-port text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="size-3.5" strokeWidth={1.75} />
            {typeof t.count === 'number' ? (
              <span className="font-mono text-[10px] tabular-nums">{t.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'discussion' ? <TaskDiscussion taskId={task.id} /> : null}
        {tab === 'files' ? (
          files.length > 0 ? (
            <div className="flex flex-col gap-1 overflow-y-auto p-3">
              {files.map((file) => (
                <span
                  key={file.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[12px] text-info hover:bg-accent/50"
                >
                  <FileText className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{file.name}</span>
                </span>
              ))}
            </div>
          ) : (
            <EmptyNote />
          )
        ) : null}
        {tab === 'links' ? (
          links.length > 0 ? (
            <div className="flex flex-col gap-1 overflow-y-auto p-3">
              {links.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[12px] text-info hover:bg-accent/50 hover:underline"
                >
                  <Link2 className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{link}</span>
                </a>
              ))}
            </div>
          ) : (
            <EmptyNote />
          )
        ) : null}
        {tab === 'history' ? (
          <div className="flex flex-col gap-2 p-4 text-sm">
            <span className="flex justify-between gap-2">
              <span className="text-muted-foreground">{ui.tasks.created}</span>
              <span className="shrink-0 font-mono text-[11px]">
                {formatDateTime(task.createdAt)}
              </span>
            </span>
            <span className="flex justify-between gap-2">
              <span className="text-muted-foreground">{ui.tasks.updated}</span>
              <span className="shrink-0 font-mono text-[11px]">
                {formatDateTime(task.updatedAt)}
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
