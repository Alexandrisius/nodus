import { useEffect } from 'react';
import { cn } from '@nodus/ui/lib/utils';

import { CIRCUIT_REMEASURE } from '../../../app/shell/circuit-geometry.js';
import { NAV_MODULES } from '../../../app/shell/nav-registry.js';
import type { ChatTab } from './messenger-body.js';

const CHAT_TABS = NAV_MODULES.find((m) => m.id === 'chat')?.tabs ?? [];

/**
 * Вкладки ПОЛНОЭКРАННОЙ карточки мессенджера (план messenger-fullscreen,
 * модель Битрикс24: карточка со вкладками Чаты / Чаты задач / Настройка),
 * ФИКСИРОВАННЫЕ из единого реестра (nav-registry; вердикт владельца
 * 15.09.2026: вкладки без кастомизации). Грамматика портов — как у вкладок
 * топбара шелла (`data-tab-port` + `data-active`): контур в режиме карточки
 * измеряет ИХ (хедер карточки — `data-card-topbar`), ось-шина идёт от точки
 * на левой границе карточки до её правого края с засечками к точкам вкладок.
 * Переключение вкладки — смена фокуса: контур перемеряется (custom-событие
 * ПОСЛЕ коммита, когда `data-active` уже в DOM) и стреляет вспышка.
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
      {CHAT_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-tab-port
          data-active={tab === t.id ? 'true' : undefined}
          onClick={() => onChange(t.id as ChatTab)}
          className={cn(
            'relative flex h-full items-center px-4 text-sm font-medium transition-colors',
            tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
          )}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
