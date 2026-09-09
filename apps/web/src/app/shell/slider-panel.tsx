import { X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeEdge, snapPx } from '@nodus/ui/components/node-edge';
import { cn } from '@nodus/ui/lib/utils';

/** Стек слайдеров: ESC закрывает только верхнюю панель (§10.2). */
const stack: string[] = [];

/** Геометрия панели уровня 1: поля 12px, верх 40px (inset-x-3 top-10). */
const PANEL_MARGIN = 12;
const PANEL_TOP = 40;
/** Насколько ребро «заходит» вдоль рамы панели влево от точки стыковки. */
const DOCK_STUB = 24;

export interface DockPoint {
  x: number;
  y: number;
}

/** Детальная панель — большой sheet снизу вверх (референс: Битрикс): во всю
 * ширину с полями и отступом сверху, чтобы каркас оставался виден; кнопки
 * управления и закрытие — слева вверху. Уровень 2 уходит глубже вниз-вправо.
 * Стыковка — фишка «слайдер-нода»: от порта родительской сущности (dockFrom,
 * координаты вьюпорта) к раме панели проходит ортогональное ребро с пульсом.
 * Хореография: панель стартует с задержкой 150 мс — сначала глаз видит, как
 * ребро растёт от строки/карточки к раме, затем панель накрывает источник,
 * а ребро растворяется за 1 с — связь читается как событие, а не как
 * «висящая» линия поверх контента. */
export function SliderPanel({
  breadcrumbs,
  level = 1,
  onClose,
  dockFrom,
  children,
}: {
  breadcrumbs: ReactNode;
  level?: 1 | 2;
  onClose: () => void;
  dockFrom?: DockPoint;
  children: ReactNode;
}) {
  const id = useId();
  const [dockVisible, setDockVisible] = useState(Boolean(dockFrom));

  useEffect(() => {
    stack.push(id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === id) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      window.removeEventListener('keydown', onKey);
    };
  }, [id, onClose]);

  const dockX = dockFrom
    ? snapPx(Math.min(Math.max(dockFrom.x, PANEL_MARGIN + DOCK_STUB + 24), window.innerWidth - 24))
    : 0;
  const dockTopY = snapPx(PANEL_TOP);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />
      {dockFrom && dockVisible ? (
        <div
          className="dock-edge-fade pointer-events-none absolute inset-0 z-30"
          onAnimationEnd={(e) => {
            // animationend всплывает: node-edge-draw на path тоже его стреляет
            if (e.animationName === 'dock-edge-fade') setDockVisible(false);
          }}
        >
          <NodeEdge
            points={[
              { x: dockX, y: dockFrom.y },
              { x: dockX, y: dockTopY },
              { x: dockX - DOCK_STUB, y: dockTopY },
            ]}
            drawOn
            pulse="once"
            active
          />
        </div>
      ) : null}
      <section
        role="dialog"
        aria-modal="true"
        style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
        className={cn(
          'animate-in slide-in-from-bottom absolute inset-x-3 bottom-0 top-10 z-20 flex flex-col rounded-t-xl border border-b-0 border-border bg-card text-card-foreground duration-300',
          level === 2 && 'inset-x-10 top-16',
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-accent"
            onClick={onClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs}
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  );
}
