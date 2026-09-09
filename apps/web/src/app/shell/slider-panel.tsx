import { X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

/** Стек слайдеров: ESC закрывает только верхнюю панель (§10.2). */
const stack: string[] = [];

/** Rect источника в координатах вьюпорта: строка списка, карточка канбана,
 *  карточка ленты — из getBoundingClientRect на клике. */
export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const OPEN_MS = 320;
const CLOSE_MS = 200;
/** Apple-style ease для раскрытия: быстрый старт, мягкая посадка. */
const OPEN_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const CLOSE_EASE = 'cubic-bezier(0.5, 0, 0.9, 0.4)';

/**
 * Детальная панель — общий слой карточки-сущности: во всю ширину с полями и
 * отступом сверху, чтобы каркас оставался виден; уровень 2 уходит глубже
 * вниз-вправо. Открытие — shared-element расширение (FLIP): панель стартует
 * точным rect'ом источника (строка/карточка, по которой кликнули) и за OPEN_MS
 * доезжает до своей геометрии — связь «кликнул здесь → открылось это» читается
 * без линий поверх контента; контент проявляется с задержкой 100 мс. Без
 * источника (прямая ссылка, палитра) — сдержанный scale-fade из центра.
 * Закрытие — обратное схлопывание в источник за CLOSE_MS.
 */
export function SliderPanel({
  breadcrumbs,
  level = 1,
  onClose,
  sourceRect,
  children,
}: {
  breadcrumbs: ReactNode;
  level?: 1 | 2;
  onClose: () => void;
  sourceRect?: SourceRect;
  children: ReactNode;
}) {
  const id = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  function requestClose() {
    if (closingRef.current) return;
    const el = panelRef.current;
    if (!sourceRect || !el) {
      closeRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    const dst = el.getBoundingClientRect();
    el.style.transition = `transform ${CLOSE_MS}ms ${CLOSE_EASE}, opacity ${CLOSE_MS}ms linear`;
    el.style.transformOrigin = 'top left';
    el.style.transform = `translate(${sourceRect.x - dst.x}px, ${sourceRect.y - dst.y}px) scale(${sourceRect.width / dst.width}, ${sourceRect.height / dst.height})`;
    el.style.opacity = '0.35';
    window.setTimeout(() => closeRef.current(), CLOSE_MS);
  }

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    stack.push(id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === id) requestCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      window.removeEventListener('keydown', onKey);
    };
  }, [id]);

  /** FLIP-старт: до.paint ставим панель в rect источника, затем отпускаем. */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || !sourceRect) return;
    const dst = el.getBoundingClientRect();
    el.style.transformOrigin = 'top left';
    el.style.transition = 'none';
    el.style.transform = `translate(${sourceRect.x - dst.x}px, ${sourceRect.y - dst.y}px) scale(${sourceRect.width / dst.width}, ${sourceRect.height / dst.height})`;
    void el.offsetWidth;
    el.style.transition = `transform ${OPEN_MS}ms ${OPEN_EASE}`;
    el.style.transform = 'none';
  }, [sourceRect]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={cn(
          'absolute inset-0 bg-black/55 transition-opacity duration-200',
          closing && 'opacity-0',
        )}
        onClick={requestClose}
        aria-hidden="true"
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute inset-x-3 bottom-0 top-10 z-20 flex flex-col rounded-t-xl border border-b-0 border-border bg-card text-card-foreground',
          level === 2 && 'inset-x-10 top-16',
          !sourceRect && 'animate-in fade-in-0 zoom-in-[0.985] duration-200',
        )}
      >
        <header
          className={cn(
            'flex h-12 shrink-0 items-center gap-2 border-b border-border px-3',
            sourceRect && !closing && 'animate-in fade-in-0 duration-200',
          )}
          style={
            sourceRect ? { animationDelay: '100ms', animationFillMode: 'backwards' } : undefined
          }
        >
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-accent"
            onClick={requestClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs}
          </nav>
        </header>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-hidden',
            sourceRect && !closing && 'animate-in fade-in-0 duration-200',
          )}
          style={
            sourceRect ? { animationDelay: '100ms', animationFillMode: 'backwards' } : undefined
          }
        >
          {children}
        </div>
      </section>
    </div>
  );
}
