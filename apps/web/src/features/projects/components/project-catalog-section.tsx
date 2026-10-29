import { Archive, Check, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

export interface CatalogRow {
  id: string;
  name: string;
  archivedAt: string | null;
}

/**
 * Секция справочника «Автоматизации» (типы проектов, портфели): строки с
 * инлайн-переименованием, архивом и возвратом; создание — тихой строкой
 * ввода (модель «+ Поле», не отдельное окно). Архив — не удаление.
 */
export function CatalogSection<T extends CatalogRow>({
  title,
  empty,
  createLabel,
  placeholder,
  rows,
  loading,
  canCreate,
  canEdit,
  canArchive,
  canRestore,
  archiveLabel,
  restoreLabel,
  onCreate,
  onRename,
  onArchive,
  onRestore,
  rowExtra,
}: {
  title: string;
  empty: string;
  createLabel: string;
  placeholder: string;
  rows: T[];
  loading: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
  archiveLabel: string;
  restoreLabel: string;
  onCreate: (name: string) => Promise<unknown> | void;
  onRename: (id: string, name: string) => Promise<unknown> | void;
  onArchive: (id: string) => Promise<unknown> | void;
  onRestore: (id: string) => Promise<unknown> | void;
  /** Дополнительный контрол строки слева от действий (типы проектов —
   *  политика поля «Шифр»). */
  rowExtra?: (row: T) => ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  async function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await onCreate(name);
      setNewName('');
      setCreating(false);
    } catch {
      // Отказ сервера уже показан тостом мутации; строка ввода остаётся.
    }
  }

  function startRename(row: T) {
    setEditingId(row.id);
    setDraft(row.name);
  }

  async function submitRename() {
    if (!editingId) return;
    const name = draft.trim();
    const row = rows.find((entry) => entry.id === editingId);
    try {
      if (name && row && name !== row.name) await onRename(editingId, name);
      setEditingId(null);
    } catch {
      // Отказ сервера уже показан тостом; режим правки остаётся.
    }
  }

  return (
    <section className="node-panel flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <NodeLabel label={title} count={rows.length} />
        {canCreate ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto text-muted-foreground"
            onClick={() => setCreating((prev) => !prev)}
          >
            <Plus className="size-3" strokeWidth={1.75} />
            {createLabel}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitCreate();
              if (event.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder={placeholder}
            aria-label={createLabel}
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <RowAction
            label={ui.common.create}
            onClick={() => void submitCreate()}
            disabled={!newName.trim()}
            visible
          >
            <Check className="size-3.5" strokeWidth={2} />
          </RowAction>
          <RowAction
            label={ui.common.cancel}
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            visible
          >
            <X className="size-3.5" strokeWidth={2} />
          </RowAction>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className="group flex h-9 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-accent/40"
            >
              {editingId === row.id ? (
                <>
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitRename();
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    aria-label={row.name}
                    className="h-7 min-w-0 flex-1 text-sm"
                  />
                  <RowAction label={ui.common.save} onClick={() => void submitRename()} visible>
                    <Check className="size-3.5" strokeWidth={2} />
                  </RowAction>
                  <RowAction label={ui.common.cancel} onClick={() => setEditingId(null)} visible>
                    <X className="size-3.5" strokeWidth={2} />
                  </RowAction>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      row.archivedAt !== null && 'text-muted-foreground line-through',
                    )}
                  >
                    {row.name}
                  </span>
                  {rowExtra && row.archivedAt === null ? rowExtra(row) : null}
                  {row.archivedAt !== null ? (
                    <NodeChip tone="muted">{ui.projects.status.archived}</NodeChip>
                  ) : null}
                  {canEdit && row.archivedAt === null ? (
                    <RowAction label={ui.projects.editProject} onClick={() => startRename(row)}>
                      <Pencil className="size-3.5" strokeWidth={1.75} />
                    </RowAction>
                  ) : null}
                  {canArchive && row.archivedAt === null ? (
                    <RowAction label={archiveLabel} onClick={() => void onArchive(row.id)}>
                      <Archive className="size-3.5" strokeWidth={1.75} />
                    </RowAction>
                  ) : null}
                  {canRestore && row.archivedAt !== null ? (
                    <RowAction label={restoreLabel} onClick={() => void onRestore(row.id)}>
                      <RotateCcw className="size-3.5" strokeWidth={1.75} />
                    </RowAction>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RowAction({
  label,
  onClick,
  disabled,
  visible,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** В режиме ввода кнопки видны всегда (не прячутся за ховером). */
  visible?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'shrink-0 text-muted-foreground transition-opacity',
        visible
          ? 'opacity-100'
          : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100',
      )}
    >
      {children}
    </Button>
  );
}
