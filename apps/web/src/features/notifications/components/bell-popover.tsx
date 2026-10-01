import { Bell } from 'lucide-react';
import { useState } from 'react';
import type { Notification } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { useNotifications, useNotificationSummary } from '../api/notifications-api.js';
import { formatCount } from '../model/group-notifications.js';
import { useOpenNotification } from '../model/open-notification.js';
import { NotificationRowCompact } from './notification-row.js';

/**
 * Колокольчик топбара (вердикт 30.09): быстрый поповер последних 5–7; клик —
 * тот же сценарий, что и в ленте (к источнику/в ридер), поповер закрывается.
 * Индикация «число + точка» (B2/E7): число — важное, тихая точка — есть фон.
 * Массового прочтения НЕТ (фидбек владельца 01.10: важное гасится только
 * осознанно — входом в источник, «Ознакомлен», «Прочитать» по одному).
 */
export function BellPopover() {
  const summary = useNotificationSummary();
  const { data } = useNotifications('attention');
  const openNotification = useOpenNotification();
  const [open, setOpen] = useState(false);
  const attention = summary.data?.attention ?? 0;
  const background = summary.data?.background ?? 0;
  const recent = (data?.items ?? []).slice(0, 7);

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
          {attention > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-4xl bg-danger px-1 font-mono text-[10px] leading-none font-semibold text-danger-foreground tabular-nums">
              {formatCount(attention)}
            </span>
          )}
          {attention === 0 && background > 0 && (
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
