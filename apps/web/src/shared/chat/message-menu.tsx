import {
  CheckSquare,
  Copy,
  Forward,
  Link2,
  ListTodo,
  Pencil,
  Pin,
  Reply,
  Star,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';
import { toast } from 'sonner';

import { openCardViaBridge } from '../lib/card-bridge.js';
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
 * Контекстное меню сообщения — ТОЛЬКО правый клик по сообщению (вердикт
 * владельца: никаких кнопок «⋯»). Radix ContextMenu — примитив ровно для
 * этого: меню открывается У КУРСОРА и клампится в viewport самим Radix
 * (свои сообщения у правого края — регрессия ручного якоря из валидации).
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
  children: ReactNode;
}) {
  const toTask = useMessageToTask();

  function run(action: MessageActionDef) {
    if (action.id === 'copy') {
      navigator.clipboard
        .writeText(message.text)
        .then(() => toast.success(ui.chat.copied))
        .catch(() => toast.error(ui.common.copyError));
      return;
    }
    if (action.id === 'toTask') {
      toTask.mutate(
        { conversationId, messageId: message.id },
        { onSuccess: (task) => openCardViaBridge({ kind: 'task', id: task.id }) },
      );
      return;
    }
    // Stub-заготовка: фича появится с бэкендом чата (реестр уже на месте).
    toast(ui.chat.actionSoon);
  }

  const defs = messageActionDefs.filter((a) => !a.mineOnly || mine);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span className="block">{children}</span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {defs.map((action, i) => (
          <span key={action.id}>
            {action.danger && i > 0 ? <ContextMenuSeparator /> : null}
            <ContextMenuItem
              variant={action.danger ? 'destructive' : 'default'}
              onClick={() => run(action)}
            >
              <action.icon className="size-4" strokeWidth={1.75} />
              {action.label}
            </ContextMenuItem>
          </span>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
