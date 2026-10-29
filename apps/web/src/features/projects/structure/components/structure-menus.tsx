import { ArrowRightLeft, Files, FolderPlus, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Fragment } from 'react';
import type { ProjectNode } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';
import { cn } from '@nodus/ui/lib/utils';
import type { RowMenuItem } from '../../../../shared/views/row-menu.js';

/** Пункты меню строки дерева структуры (#467): один реестр на «шашку»
 *  (DropdownMenu, модель Битрикс24) и ПКМ (ContextMenu, прецедент чата —
 *  сообщение message-menu.tsx). Действия — коллбэки вкладки. */

export interface StructureMenuActions {
  createInside: (parent: ProjectNode) => void;
  createBatchInside: (parent: ProjectNode) => void;
  addTask: (node: ProjectNode) => void;
  rename: (node: ProjectNode) => void;
  moveNode: (node: ProjectNode) => void;
  deleteNode: (node: ProjectNode) => void;
}

export function nodeMenuItems(node: ProjectNode, a: StructureMenuActions): RowMenuItem[] {
  return [
    {
      id: 'create-inside',
      icon: <FolderPlus className="size-3.5" />,
      label: ui.structure.createInside,
      onSelect: () => a.createInside(node),
    },
    {
      id: 'create-batch-inside',
      icon: <ListPlus className="size-3.5" />,
      label: ui.structure.createBatchInside,
      onSelect: () => a.createBatchInside(node),
    },
    {
      id: 'add-task',
      icon: <Plus className="size-3.5" />,
      label: ui.structure.addTask,
      onSelect: () => a.addTask(node),
    },
    {
      id: 'rename',
      icon: <Pencil className="size-3.5" />,
      separatorBefore: true,
      label: ui.structure.rename,
      onSelect: () => a.rename(node),
    },
    {
      id: 'move',
      icon: <ArrowRightLeft className="size-3.5" />,
      label: ui.structure.move,
      onSelect: () => a.moveNode(node),
    },
    {
      id: 'delete',
      icon: <Trash2 className="size-3.5" />,
      separatorBefore: true,
      danger: true,
      label: ui.structure.remove,
      onSelect: () => a.deleteNode(node),
    },
  ];
}

export interface TaskMenuActions {
  open: (taskId: string, anchor?: HTMLElement) => void;
  moveTasks: (taskIds: string[]) => void;
  removeFromStructure: (taskId: string) => void;
  /** Задача уже вне структуры — «Убрать» не показывается. */
  inStructure: boolean;
}

export function taskMenuItems(taskId: string, a: TaskMenuActions): RowMenuItem[] {
  return [
    {
      id: 'open',
      label: ui.structure.openTask,
      onSelect: () => a.open(taskId),
    },
    {
      id: 'move',
      icon: <ArrowRightLeft className="size-3.5" />,
      label: ui.structure.moveTasksTo,
      separatorBefore: true,
      onSelect: () => a.moveTasks([taskId]),
    },
    ...(a.inStructure
      ? [
          {
            id: 'remove-from-structure',
            icon: <Files className="size-3.5" />,
            label: ui.structure.removeFromStructure,
            onSelect: () => a.removeFromStructure(taskId),
          },
        ]
      : []),
  ];
}

/** ПКМ-меню из того же реестра пунктов (шашка — RowMenu в row-menu.tsx). */
export function StructureContextMenu({
  items,
  children,
}: {
  items: RowMenuItem[];
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              onSelect={item.onSelect}
              className={cn(item.danger && 'text-destructive focus:text-destructive')}
            >
              {item.icon}
              {item.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
