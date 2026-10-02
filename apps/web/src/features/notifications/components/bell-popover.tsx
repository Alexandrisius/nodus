import { Bell } from 'lucide-react';
import { useState } from 'react';
import type { Notification } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { useNotifications, useNotificationSummary } from '../api/notifications-api.js';
import { formatCount, PRIORITY_ORDER } from '../model/group-notifications.js';
import { useOpenNotification } from '../model/open-notification.js';
import { NotificationRowCompact } from './notification-row.js';

/**
 * Колокольчик топбара (вердикт 30.09): быстрый поповер последних 5–7; клик —
 * тот же сценарий, что и в ленте (к источнику/в ридер), поповер закрывается.
 * Индикация «число + точка» (B2/E7): число — важное, тихая точка — есть фон.
 * Список — из ВСЕХ непрочитанных, старший ярус сверху (#189: точка фона
 * всегда раскрываема — колокольчик и лента показывают одно и то же).
 * Массового прочтения НЕТ (фидбек владельца 01.10: важное гасится только
 * осознанно — входом в источник, «Ознакомлен», «Прочитать» по одному).
 */
export function BellPopover() {
  const summary = useNotificationSummary();
  const attention = useNotifications('attention');
  const low = useNotifications('low');
  const openNotification = useOpenNotification();
  const [open, setOpen] = useState(false);
  const attentionCount = summary.data?.attention ?? 0;
  const lowCount = summary.data?.low ?? 0;
  // Два окна (#189): важное не вытесняется потоком низкого; старший
  // приоритет сверху, внутри — по свежести.
  const recent = [...(attention.data?.items ?? []), ...(low.data?.items ?? [])]
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.seq - a.seq)
    .slice(0, 7);

  function openItem(item: Notification) {
    setOpen(false);
    openNotification(item);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={ui.notifications.bellLabel}
        >
          <Bell className="size-4" strokeWidth={1.75} />
          {attentionCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-4xl bg-danger px-1 font-mono text-[10px] leading-none font-semibold text-danger-foreground tabular-nums">
              {formatCount(attentionCount)}
            </span>
          )}
          {attentionCount === 0 && lowCount > 0 && (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="px-2 pt-1 pb-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {ui.notifications.bellRecent}
        </div>
        {recent.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {ui.notifications.bellEmpty}
          </div>
        ) : (
          <div className="flex max-h-80 flex-col overflow-y-auto" data-no-scrollbar>
            {recent.map((item) => (
              <NotificationRowCompact key={item.id} item={item} onOpen={openItem} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
