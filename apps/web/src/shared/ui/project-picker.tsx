import { FolderOpen, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { useProjectsList } from '../api/projects-list.js';
import { ProjectIdentityIcon } from './project-identity-icon.js';

/**
 * Выбор проекта — МАСШТАБНОЕ окно, не «просто выпадающий список» (вердикт
 * владельца 15.09.2026, модель Битрикс24): названия проектов длинные —
 * окно шире поля, со своим поиском по коду/названию и строками на всю
 * ширину; внизу — «Создать проект» (НА БУДУЩЕЕ по прямому вердикту: окна
 * создания проекта пока нет — показана, действия нет). Потребитель:
 * экспресс-форма задачи (`shared/tasks`), далее — все формы с проектом.
 */
export function ProjectPicker({
  value,
  onChange,
  ariaLabel,
}: {
  /** id выбранного проекта; undefined — «Без проекта». */
  value: string | undefined;
  onChange: (projectId: string | undefined) => void;
  ariaLabel: string;
}) {
  const { data } = useProjectsList();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Сброс запроса при закрытии — во время рендера (канон React, аудит #45).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setQuery('');
  }

  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((p) => p.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    : items;

  function choose(projectId: string | undefined) {
    onChange(projectId);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-accent/40 dark:bg-input/30"
        >
          {selected ? (
            <ProjectIdentityIcon color={selected.color} className="size-4 shrink-0" />
          ) : (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left',
              !selected && 'text-muted-foreground',
            )}
            title={selected ? `${selected.code} — ${selected.name}` : undefined}
          >
            {selected ? `${selected.code} — ${selected.name}` : ui.tasks.noProject}
          </span>
          {selected ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={ui.filters.reset}
              onClick={(e) => {
                e.stopPropagation();
                choose(undefined);
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" strokeWidth={1.75} />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ui.common.searchPlaceholder}
              aria-label={ui.common.search}
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => choose(project.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                project.id === value && 'bg-accent/60',
              )}
            >
              <ProjectIdentityIcon color={project.color} className="size-5 shrink-0" />
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={`${project.code} — ${project.name}`}
              >
                <span className="font-mono text-label-sm text-muted-foreground">
                  {project.code}
                </span>{' '}
                {project.name}
              </span>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {ui.filters.notFound}
            </div>
          ) : null}
        </div>
        {/* «Создать проект» — НА БУДУЩЕЕ (вердикт владельца 15.09.2026: кнопка
            нужна в окне; окна создания проекта пока нет — действия нет). */}
        <div className="border-t border-border p-1.5">
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={1.75} />
            {ui.projects.createProject}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
