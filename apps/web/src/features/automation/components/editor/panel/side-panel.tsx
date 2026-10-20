import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { ArrowLeft, X } from 'lucide-react';

import { measureCircuit } from '../../../../../app/shell/circuit-geometry.js';

/** Ширина правой панели редактора (резерв строки инструментов — от неё). */
export const SIDE_PANEL_WIDTH = 384;

/** Открыт ли сейчас оверлей Radix (меню, поповер, список, диалог) — Esc его. */
function overlayOpen(): boolean {
  return document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"]') !== null;
}

/** Сдвиг верха панели к оси контура: axisY (тот же замер, что рисует
 *  контур) минус верх контейнера панели; пересчёт на resize. */
function useAxisTop(ref: React.RefObject<HTMLDivElement | null>): number {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const axisY = measureCircuit(pathname, false)?.axisY;
      const parent = ref.current?.offsetParent;
      const parentTop = parent?.getBoundingClientRect().top;
      setTop(axisY !== undefined && parentTop !== undefined ? Math.max(0, axisY - parentTop) : 0);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [pathname, ref]);
  return top;
}

/**
 * Внутриоконная боковая панель (канон #84, вердикт 24.09.2026): absolute
 * поверх холста — перекрывает, не двигает; верх — на горизонтали оси контура,
 * бордер по периметру, радиус 14, крестик у края шапки. Обёртка монтирована
 * всегда (закон выдвижных поверхностей: ширина плавно и в первое открытие),
 * прокрутка только вертикальная — горизонтальной нет. Esc: сначала «назад»
 * из раздела, потом закрыть.
 */
export function SidePanel({
  open,
  title,
  onClose,
  onBack,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Раздел внутри панели: стрелка «назад» в шапке (и первый Esc). */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const top = useAxisTop(ref);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || overlayOpen()) return;
      event.preventDefault();
      if (onBack) onBack();
      else onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onBack, onClose]);

  return (
    <div
      ref={ref}
      aria-hidden={!open}
      style={{ top }}
      className={cn(
        'absolute right-2 bottom-2 z-20 overflow-hidden transition-[width] duration-200 ease-out',
        open ? 'w-[384px]' : 'pointer-events-none w-0',
      )}
    >
      {/* nokey: Delete/Backspace на контролах панели (Select, Switch) не
          удаляют выделенное на холсте (фильтр клавиш React Flow). */}
      <div className="nokey flex h-full w-[384px] flex-col rounded-[14px] border border-border bg-card">
        <div className="flex h-14 shrink-0 items-center gap-1 pr-2 pl-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={ui.automation.panel.back}
              className="-ml-2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} />
            </button>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium" title={title}>
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui.common.close}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 pb-4 *:min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
