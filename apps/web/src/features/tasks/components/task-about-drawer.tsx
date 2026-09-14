import { FileText, History, Link2, Star, X } from 'lucide-react';
import { memo, useState } from 'react';
import type { TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { formatDateTime } from '../../../shared/lib/format.js';
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
    <section className="rounded-lg border border-border p-3">
      <h4 className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <NodeLabel label={title} />
      </h4>
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Выдвижная дополнительная панель «О задаче» — ВТАЛКИВАЮЩАЯ колонка справа
 * (не оверлей: чат и композер остаются доступны, вердикт владельца; плавный
 * пуш — transition-[width] на колонке-обёртке в task-card): файлы и медиа,
 * ссылки, история + избранное. По умолчанию скрыта — обсуждение всегда
 * видно в своей колонке, а свойства достаются по кнопке.
 */
export const TaskAboutDrawer = memo(function TaskAboutDrawer({
  task,
  onClose,
}: {
  task: TaskDetail;
  onClose: () => void;
}) {
  const { data } = useTaskMessages(task.id);
  const [favorite, setFavorite] = useState(false);

  const files = (data?.items ?? []).flatMap((m) => m.attachments);
  const links = [task.description, ...(data?.items ?? []).map((m) => m.text)].flatMap(
    (text) => text.match(/https?:\/\/\S+/g) ?? [],
  );

  return (
    // Геометрия Битрикс24 (вердикт владельца 15.09.2026): панель —
    // ПОЛНОВЫСОТНАЯ колонка-сиблинг, занимает ВЕРХНИЙ БАР карточки тоже;
    // верхняя строка (название слева, избранное и крестик У КРАЯ справа) —
    // на высоте бара, border-b продолжает линию бара; внутренних перегородок
    // нет, единственная вертикаль — структурная левая граница колонки.
    <aside className="flex h-full w-[360px] flex-col border-l border-border bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <NodeLabel label={ui.tasks.aboutTask} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
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
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-accent"
            onClick={onClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <Section icon={FileText} title={ui.chat.filesMedia}>
          {files.length > 0 ? (
            files.map((file) => (
              <span key={file.id} className="truncate font-mono text-[12px] text-info">
                {file.name}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
          )}
        </Section>

        <Section icon={Link2} title={ui.chat.links}>
          {links.length > 0 ? (
            links.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noreferrer"
                className="truncate font-mono text-[12px] text-info hover:underline"
              >
                {link}
              </a>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
          )}
        </Section>

        <Section icon={History} title={ui.tasks.history}>
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{ui.tasks.created}</span>
            <span className="shrink-0 font-mono text-[11px]">{formatDateTime(task.createdAt)}</span>
          </span>
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{ui.tasks.updated}</span>
            <span className="shrink-0 font-mono text-[11px]">{formatDateTime(task.updatedAt)}</span>
          </span>
        </Section>
      </div>
    </aside>
  );
});
