import { useEffect } from 'react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { CIRCUIT_REMEASURE } from '../../../app/shell/circuit-geometry.js';
import type { ChatTab } from './messenger-body.js';

const TABS: { id: ChatTab; label: string }[] = [
  { id: 'chats', label: ui.chat.tabChats },
  { id: 'tasks', label: ui.chat.tabTaskChats },
  { id: 'settings', label: ui.chat.tabSettings },
];

/**
 * Вкладки ПОЛНОЭКРАННОЙ карточки мессенджера (план messenger-fullscreen,
 * модель Битрикс24: карточка со вкладками Чаты / Чаты задач / Настройка).
 * Грамматика портов — как у вкладок топбара шелла (`data-tab-port` +
 * `data-active`): контур в режиме карточки измеряет ИХ (хедер карточки —
 * `data-card-topbar`), ось-шина идёт от точки на левой границе карточки до
 * её правого края с засечками к точкам вкладок. Переключение вкладки —
 * смена фокуса: контур перемеряется (custom-событие ПОСЛЕ коммита, когда
 * `data-active` уже в DOM) и стреляет вспышка.
 */
export function MessengerTabs({
  tab,
  onChange,
}: {
  tab: ChatTab;
  onChange: (tab: ChatTab) => void;
}) {
  useEffect(() => {
    window.dispatchEvent(new Event(CIRCUIT_REMEASURE));
  }, [tab]);

  return (
    <nav className="flex h-full min-w-0 flex-1 items-center">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-tab-port
          data-active={tab === t.id ? 'true' : undefined}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative flex h-full items-center px-4 font-mono text-[12px] font-medium tracking-[0.14em] uppercase transition-colors',
            tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
          )}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
