import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/** Число непрочитанных на вкладке мессенджера (#409): компактная цифра в
 *  каноне бейджей (mono 10px, tabular-nums, тон danger — как бейдж модуля
 *  в рейке). Больше 99 — «99+». Ноль не рендерится. */
export function TabUnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${ui.chat.unreadHint}`}
      className={cn(
        'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1',
        'font-mono text-badge leading-none font-medium text-destructive-foreground tabular-nums',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
