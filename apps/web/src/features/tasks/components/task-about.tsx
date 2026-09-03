import { FileText, History, Link2, Star, Users } from 'lucide-react';
import { useState } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { useTaskMessages } from '../api/tasks-api.js';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Star;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-background p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
      </h4>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** Правая панель карточки задачи «О задаче» (референс: Телеграм/Битрикс). */
export function TaskAbout({ task }: { task: TaskDetail }) {
  const { data } = useTaskMessages(task.id);
  const [favorite, setFavorite] = useState(false);

  const files = (data?.items ?? []).flatMap((m) => m.attachments);
  const links = [task.description, ...(data?.items ?? []).map((m) => m.text)].flatMap(
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

  return (
    <aside className="paper-surface flex min-h-0 flex-col gap-3 overflow-y-auto border-l p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{ui.tasks.aboutTask}</h3>
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

      <Section icon={Users} title={ui.tasks.participants}>
        {people.map((person) => (
          <span key={person.id} className="flex items-center gap-2 text-sm">
            <PersonAvatar name={person.displayName} className="size-6" />
            {person.displayName}
          </span>
        ))}
      </Section>

      {files.length > 0 && (
        <Section icon={FileText} title={ui.tasks.filesMedia}>
          {files.map((file) => (
            <span key={file.id} className="truncate text-sm text-info">
              {file.name}
            </span>
          ))}
        </Section>
      )}

      {links.length > 0 && (
        <Section icon={Link2} title={ui.tasks.links}>
          {links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm text-info hover:underline"
            >
              {link}
            </a>
          ))}
        </Section>
      )}

      <Section icon={History} title={ui.tasks.history}>
        <span className="flex justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{ui.tasks.created}</span>
          <span className="shrink-0 text-xs">{formatDateTime(task.createdAt)}</span>
        </span>
        <span className="flex justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{ui.tasks.updated}</span>
          <span className="shrink-0 text-xs">{formatDateTime(task.updatedAt)}</span>
        </span>
      </Section>
    </aside>
  );
}
