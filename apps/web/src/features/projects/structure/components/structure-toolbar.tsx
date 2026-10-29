import { ChevronsDownUp, ChevronsUpDown, FolderPlus, ListPlus } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

/** Строка инструментов вкладки «Структура»: создание (узел / пачкой) и
 *  разворачивание дерева. Функциональная механика; визуал — UI-агент. */
export function StructureToolbar({
  onCreateNode,
  onCreateBatch,
  onExpandAll,
  onCollapseAll,
}: {
  onCreateNode: () => void;
  onCreateBatch: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 px-4">
      <Button type="button" size="sm" onClick={onCreateNode}>
        <FolderPlus data-icon="inline-start" className="size-3.5" />
        {ui.structure.createNode}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCreateBatch}>
        <ListPlus data-icon="inline-start" className="size-3.5" />
        {ui.structure.createNodesBatch}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={ui.structure.expandAll}
        aria-label={ui.structure.expandAll}
        onClick={onExpandAll}
      >
        <ChevronsUpDown className="size-3.5" strokeWidth={1.75} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={ui.structure.collapseAll}
        aria-label={ui.structure.collapseAll}
        onClick={onCollapseAll}
      >
        <ChevronsDownUp className="size-3.5" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

/** Пустое состояние: структура не задана — первый узел отсюда. */
export function StructureEmpty({ onCreateNode }: { onCreateNode: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pt-16 text-center">
      <p className="text-sm font-medium">{ui.structure.empty}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{ui.structure.emptyHint}</p>
      <Button type="button" size="sm" onClick={onCreateNode}>
        <FolderPlus data-icon="inline-start" className="size-3.5" />
        {ui.structure.createNode}
      </Button>
    </div>
  );
}
