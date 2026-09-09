import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

const CLOSE_MS = 200;
const CLOSE_EASE = 'cubic-bezier(0.5, 0, 0.9, 0.4)';

/**
 * Детальная панель — общий слой карточки-сущности: во всю ширину с полями и
 * отступом сверху, чтобы каркас оставался виден; уровень 2 уходит глубже
 * вниз-вправо. Открытие — shared-element расширение (FLIP): панель стартует
 * точным rect'ом источника (строка/карточка, по которой кликнули) и за 430 мс
 * доезжает до своей геометрии — связь «кликнул здесь → открылось это» читается
 * без линий поверх контента; контент проявляется с задержкой 160 мс. Без
 * источника (прямая ссылка, палитра) — сдержанный scale-fade из центра.
 * Закрытие — обратное схлопывание в источник за CLOSE_MS.
 *
 * Хореография (канон, см. nodus-ui-style/references/circuit.md):
 * — анимация строго transform/opacity (композитор): не зависит от занятости
 *   main thread, первое открытие равно повторным;
 * — тяжёлый контент (children) монтируется ПОСЛЕ первого отрисованного кадра
 *   (double rAF): маунт дерева карточки не блокирует старт раскрытия;
 * — затемняющего задника НЕТ (фон страницы цвета не меняет, референс —
 *   слайдер Битрикс24): модальность дают тень slider-shadow и прозрачный
 *   click-catcher (клик мимо панели закрывает её).
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
    const to = `translate(${sourceRect.x - dst.x}px, ${sourceRect.y - dst.y}px) scale(${sourceRect.width / dst.width}, ${sourceRect.height / dst.height})`;
    const anim = el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: to, opacity: 0.35 },
      ],
      { duration: CLOSE_MS, easing: CLOSE_EASE },
    );
    anim.onfinish = () => closeRef.current();
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

  /** Монтирование тяжёлого контента ПОСЛЕ первого отрисованного кадра панели:
   *  double rAF гарантирует, что хром панели (пустая оболочка) уже отрисован,
   *  анимация раскрытия стартовала и ушла на композитор — синхронный маунт
   *  дерева карточки (десятки мс на первом открытии) не задерживает её кадры. */
  const [contentMounted, setContentMounted] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setContentMounted(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  /** FLIP-переменные раскрытия: геометрия панели детерминирована
   *  (inset-x-3 top-10 / level2 inset-x-10 top-16), поэтому дельты считаются
   *  без замеров; анимация — CSS @keyframes slider-expand (стартует с первого
   *  кадра на любом окружении, в отличие от transition/WAAPI на маунте). */
  const flipStyle: CSSProperties | undefined = sourceRect
    ? (() => {
        const dst =
          level === 2
            ? { x: 40, y: 64, w: window.innerWidth - 80, h: window.innerHeight - 64 }
            : { x: 12, y: 40, w: window.innerWidth - 24, h: window.innerHeight - 40 };
        return {
          '--flip-tx': `${sourceRect.x - dst.x}px`,
          '--flip-ty': `${sourceRect.y - dst.y}px`,
          '--flip-sx': `${sourceRect.width / dst.w}`,
          '--flip-sy': `${sourceRect.height / dst.h}`,
        } as CSSProperties;
      })()
    : undefined;

  return (
    <div className="fixed inset-0 z-50">
      {/* Прозрачный click-catcher вместо затемняющего задника: страница за
          панелью цвета не меняет; клик мимо панели закрывает её. */}
      <div className="absolute inset-0" onClick={requestClose} aria-hidden="true" />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={flipStyle}
        className={cn(
          'slider-shadow absolute inset-x-3 bottom-0 top-10 z-20 flex flex-col rounded-t-xl border border-b-0 border-border bg-card text-card-foreground',
          level === 2 && 'inset-x-10 top-16',
          sourceRect ? 'slider-expand' : 'slider-pop',
        )}
      >
        <header
          className={cn(
            'flex h-12 shrink-0 items-center gap-2 border-b border-border px-3',
            sourceRect && !closing && 'content-fade',
          )}
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
          className={cn('min-h-0 flex-1 overflow-hidden', sourceRect && !closing && 'content-fade')}
        >
          {contentMounted ? children : null}
        </div>
      </section>
    </div>
  );
}
