import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Archive, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import type { CustomFieldDefinition, CustomFieldScope } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useArchiveCustomField, useReorderCustomFields } from '../../api/custom-fields-api.js';
import { SortableFieldRow } from './field-list-row.js';

/** Порядок групп — порядок областей в контракте (Р1). */
export const FIELD_SCOPES: readonly CustomFieldScope[] = [
  'task',
  'letter',
  'project',
  'counterparty',
];

/**
 * Левая колонка реестра полей (#431): грамматика списка типов и бесед —
 * шапка h-14 с поиском и «+», группы областей с моно-заголовком и счётчиком,
 * строка «плитка-значок + название + мета», меню «⋯» по ховеру, архив —
 * свёрнутой группой внизу. Порядок внутри группы — перетаскиванием
 * (dnd-kit, клавиатура), меняется только с правом (Р13).
 */
export function FieldList({
  definitions,
  isLoading,
  isError,
  selectedId,
  canManage,
  onSelect,
  onCreate,
  onRetry,
}: {
  definitions: readonly CustomFieldDefinition[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  canManage: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archive = useArchiveCustomField(true);
  const restore = useArchiveCustomField(false);
  const reorder = useReorderCustomFields();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const q = query.trim().toLowerCase();
  const matches = (definition: CustomFieldDefinition) =>
    !q || definition.name.toLowerCase().includes(q);
  const alive = definitions.filter((definition) => definition.archivedAt === null);
  const archived = definitions.filter((definition) => definition.archivedAt !== null);

  const row = (definition: CustomFieldDefinition) => (
    <SortableFieldRow
      key={definition.id}
      definition={definition}
      selected={definition.id === selectedId}
      canManage={canManage}
      archived={definition.archivedAt !== null}
      onSelect={() => onSelect(definition.id)}
      onArchive={() =>
        definition.archivedAt === null
          ? archive.mutate(definition.id)
          : restore.mutate(definition.id)
      }
    />
  );

  const group = (scope: CustomFieldScope) => {
    const items = alive.filter((definition) => definition.scope === scope && matches(definition));
    if (q && items.length === 0) return null;
    const onDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = items.findIndex((definition) => definition.id === active.id);
      const to = items.findIndex((definition) => definition.id === over.id);
      if (from < 0 || to < 0) return;
      reorder.mutate({ scope, ids: arrayMove(items, from, to).map((definition) => definition.id) });
    };
    return (
      <div key={scope} className="flex flex-col gap-0.5">
        <NodeLabel
          label={ui.customFields.scopes[scope]}
          count={items.length}
          className="px-2.5 pt-2 pb-1"
        />
        {items.length === 0 ? (
          <p className="px-2.5 pb-1 text-xs text-muted-foreground">
            {ui.customFields.list.emptyScope}
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={items.map((definition) => definition.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-0.5">{items.map(row)}</div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    );
  };

  const archivedMatches = archived.filter(matches);
  const anyVisible =
    FIELD_SCOPES.some((scope) => alive.some((d) => d.scope === scope && matches(d))) ||
    archivedMatches.length > 0;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ui.customFields.list.search}
            aria-label={ui.customFields.list.search}
            className="h-8 pr-7 pl-8 text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={ui.filters.reset}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={onCreate}
            aria-label={ui.customFields.list.newField}
            title={ui.customFields.list.newField}
            className="ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-1">
            <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-9 animate-pulse rounded-lg bg-muted/60" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-start gap-1 px-2 py-2 text-sm text-muted-foreground">
            <span>{ui.customFields.block.loadError}</span>
            <button
              type="button"
              onClick={onRetry}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {ui.customFields.block.retry}
            </button>
          </div>
        ) : (
          <>
            {FIELD_SCOPES.map(group)}
            {archivedMatches.length > 0 ? (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setArchiveOpen((value) => !value)}
                  aria-expanded={archiveOpen}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  <Archive className="size-3.5" strokeWidth={1.75} />
                  {ui.customFields.list.archiveGroup} · {archivedMatches.length}
                </button>
                {archiveOpen ? (
                  <div className="flex flex-col gap-0.5">{archivedMatches.map(row)}</div>
                ) : null}
              </div>
            ) : null}
            {q && !anyVisible ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">{ui.filters.notFound}</p>
            ) : null}
            {alive.length === 0 && archived.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">
                {ui.customFields.list.empty}
              </p>
            ) : null}
            {!canManage ? (
              <p className="mt-auto px-2.5 py-2 text-label-sm text-muted-foreground">
                {ui.customFields.list.readOnly}
              </p>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
