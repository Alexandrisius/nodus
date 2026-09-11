import {
  CheckSquare,
  Copy,
  Forward,
  Link2,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Pin,
  Reply,
  Star,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { useOpenCard } from '../../app/shell/use-card-stack.js';
import { useMessageToTask } from './api.js';

/**
 * Реестр действий над сообщением (вердикт владельца 2026-09-11, раунд 3 —
 * модель контекстного меню Битрикс24). Это ЗАГОТОВКА под бэкенд чата:
 * пункты и их порядок зафиксированы, работают сейчас «Копировать» (клиент)
 * и «Создать задачу» (поток Б уже реализован); остальные — stub: отвечают
 * тостом `actionSoon`, пока не появился сервер сообщений. Новая серверная
 * возможность = снятие флага stub + обработчик, меню не меняется.
 */
interface MessageActionDef {
  id: string;
  icon: typeof Reply;
  label: string;
  /** Доступно только над своими сообщениями (редактирование, удаление). */
  mineOnly?: boolean;
  danger?: boolean;
  stub?: boolean;
}

const messageActionDefs: MessageActionDef[] = [
  { id: 'reply', icon: Reply, label: ui.chat.menu.reply, stub: true },
  { id: 'copy', icon: Copy, label: ui.chat.menu.copy },
  { id: 'edit', icon: Pencil, label: ui.chat.menu.edit, mineOnly: true, stub: true },
  { id: 'forward', icon: Forward, label: ui.chat.menu.forward, stub: true },
  { id: 'toTask', icon: ListTodo, label: ui.chat.menu.createTask },
  { id: 'pin', icon: Pin, label: ui.chat.menu.pin, stub: true },
  { id: 'copyLink', icon: Link2, label: ui.chat.menu.copyLink, stub: true },
  { id: 'favorite', icon: Star, label: ui.chat.menu.favorite, stub: true },
  { id: 'select', icon: CheckSquare, label: ui.chat.menu.select, stub: true },
  {
    id: 'delete',
    icon: Trash2,
    label: ui.chat.menu.delete,
    mineOnly: true,
    danger: true,
    stub: true,
  },
];

/**
 * Контекстное меню сообщения: правый клик по сообщению + ховер-кнопка «⋯»
 * (children — render-prop, получает openMenu для кнопки; по координатам
 * клипа меню якорится к кнопке). Один DropdownMenu с «виртуальным»
 * триггером-якорем по координатам указателя.
 */
export function MessageMenu({
  message,
  mine,
  conversationId,
  children,
}: {
  message: ChatMessage;
  mine: boolean;
  conversationId: string;
  children: (openMenu: (x: number, y: number) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const toTask = useMessageToTask();
  const openCard = useOpenCard();

  function openMenu(x: number, y: number) {
    setPos({ x, y });
    setOpen(true);
  }

  function run(action: MessageActionDef) {
    if (action.id === 'copy') {
      void navigator.clipboard.writeText(message.text).then(() => toast.success(ui.chat.copied));
      return;
    }
    if (action.id === 'toTask') {
      toTask.mutate(
        { conversationId, messageId: message.id },
        { onSuccess: (task) => openCard({ kind: 'task', id: task.id }) },
      );
      return;
    }
    // Stub-заготовка: фича появится с бэкендом чата (реестр уже на месте).
    toast(ui.chat.actionSoon);
  }

  const defs = messageActionDefs.filter((a) => !a.mineOnly || mine);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="fixed z-0 size-0" style={{ left: pos.x, top: pos.y }} />
      </DropdownMenuTrigger>
      {/* Правый клик по сообщению — меню у указателя (модель мессенджеров). */}
      <span
        className="contents"
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(e.clientX, e.clientY);
        }}
      >
        {children(openMenu)}
      </span>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        {defs.map((action, i) => (
          <span key={action.id}>
            {action.danger && i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onClick={() => run(action)}
              className={cn(action.danger && 'text-destructive focus:text-destructive')}
            >
              <action.icon className="size-4" strokeWidth={1.75} />
              {action.label}
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ховер-кнопка «⋯» для слота действий сообщения — открывает то же меню. */
export function MessageMenuButton({ onOpen }: { onOpen: (x: number, y: number) => void }) {
  return (
    <button
      type="button"
      aria-label={ui.common.more}
      title={ui.common.more}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
      className="inline-flex items-center rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <MoreHorizontal className="size-4" strokeWidth={1.75} />
    </button>
  );
}
