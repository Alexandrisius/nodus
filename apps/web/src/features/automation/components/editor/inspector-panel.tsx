import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { X } from 'lucide-react';

/**
 * Внутриоконная правая панель-инспектор (канон #84): absolute поверх холста,
 * рамка по периметру, радиус 14, крестик у края шапки; открытие — плавное
 * (transition-width, обёртка монтирована постоянно — закон выдвижных
 * поверхностей: панель живёт в DOM в покое с нулевой шириной).
 */
export function InspectorPanel({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-2 right-2 z-10 top-0 flex justify-end overflow-hidden transition-[width] duration-200 ease-out',
        open ? (wide ? 'w-[384px]' : 'w-[320px]') : 'w-0',
      )}
    >
      <div className="pointer-events-auto flex h-full w-[384px] flex-col rounded-[14px] border bg-card">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <span className="truncate text-sm font-medium">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui.common.close}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
