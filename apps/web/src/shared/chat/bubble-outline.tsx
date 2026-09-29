import { useEffect, useId, useRef, useState } from 'react';

import { UI_SCALE } from '../ui/ui-scale.js';

/**
 * Слой контура пузыря (#155, ревизия 10 — ЕДИНАЯ ЛИНИЯ ГРАНИЦЫ).
 * История репро владельца: полоса пузыря (box-shadow inset) и полоса хвоста
 * (SVG-штрих) на ЦЕЛЫХ зумах совпадали, на дробных (110/150/175%) хвост
 * оказывался «чуть глубже» — браузер округляет края CSS-тени к физическим
 * пикселям не так, как растеризует SVG-штрих; два механизма никогда не
 * сойдутся идеально. Решение: ВСЯ граница — ОДИН замкнутый SVG-контур
 * (коробка пузыря с радиусами + силуэт хвоста одной кривой), один штрих,
 * один растеризатор: коробке и хвосту физически нечем расходиться.
 *
 * Полоса: штрих (полная ширина 4css, внутрь 2) + прикрытие цветом заливки
 * (полная 2css, внутрь 1) + клип по силуэту = видимая полоса [1,2] css px
 * от края — глубина прежней box-shadow полосы (под рамкой 1px). Прикрытие
 * на коробке невидимо (тот же цвет, что фон пузыря, — рисуется поверх
 * фона), на хвосте съедает первый пиксель от края.
 *
 * Заливка плавника живёт здесь же (внизу,translate/scale от 20-юнитовой
 * геометрии с привязкой к device-сетке — вердикт владельца р.9: заливка
 * ровная на ВСЕХ зумах; механику не трогать). Слой — inset-0 (бокс пузыря),
 * pointer-events-none, overflow-visible (плавник выходит за край).
 * Пересчёт: ResizeObserver (текст/вложения меняют размер) + window resize
 * (зум браузера). Пустой svg ничего не рисует — прятать до замера НЕЛЬЗЯ
 * (display:none убивает раскладку и измерение, урок р.8).
 */
const FIN_UNITS = 20;
/** Радиус углов пузыря = rounded-xl (0.75rem) в css px. */
const BOX_RADIUS = 12 * UI_SCALE;
/** Полосы: штрих полной шириной 4css (внутрь 2), прикрытие 2css (внутрь 1)
 *  — видимая полоса [1,2] css px. */
const RING_STROKE_CSS = 4;
const COVER_STROKE_CSS = 2;

const f = (n: number) => Math.round(n * 100) / 100;

/** Замкнутый контур пузыря (css px, по часовой от левого-верхнего угла):
 *  радиусы углов — как rounded-xl; угол со стороны хвоста ПРЯМОЙ, в него
 *  вписан плавник одной кривой (стык — точка на кромке, вход вертикален). */
function outlinePath(w: number, h: number, side: 'left' | 'right' | null, u: number): string {
  const r = Math.min(BOX_RADIUS, w / 2, h / 2);
  if (side === null) {
    return `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} V${f(h - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} H${f(r)} A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} V${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`;
  }
  if (side === 'left') {
    return (
      `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} V${f(h - r)}` +
      ` A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} H0` +
      ` L${f(-5.2 * u)} ${f(h)}` +
      ` Q${f(-7.8 * u)} ${f(h - 0.4 * u)} ${f(-6.5 * u)} ${f(h - 1.5 * u)}` +
      ` C${f(-3.5 * u)} ${f(h - 2.5 * u)} 0 ${f(h - 4.5 * u)} 0 ${f(h - 9 * u)}` +
      ` V${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`
    );
  }
  return (
    `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} V${f(h - 9 * u)}` +
    ` C${f(w)} ${f(h - 4.5 * u)} ${f(w + 3.5 * u)} ${f(h - 2.5 * u)} ${f(w + 6.5 * u)} ${f(h - 1.5 * u)}` +
    ` Q${f(w + 7.8 * u)} ${f(h - 0.4 * u)} ${f(w + 5.2 * u)} ${f(h)} L${f(w)} ${f(h)} H${f(r)}` +
    ` A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} V${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`
  );
}

interface LayerGeom {
  /** Размеры бокса пузыря (css px, device-снап — рёбра коробки в целых
   *  физических пикселях, как у CSS-бокса: заливка/кольцо crisp на всех
   *  зумах). */
  w: number;
  h: number;
  /** Масштаб юнита плавника (css px, device-снап — р.9). */
  unit: number;
}

function measureLayer(rect: DOMRect): LayerGeom {
  const dpr = window.devicePixelRatio || 1;
  const topDev = Math.round(rect.top * dpr);
  const bottomDev = Math.round((rect.top + rect.height) * dpr);
  const wDev = Math.max(1, Math.round(rect.width * dpr));
  const finSizeDev = Math.max(1, Math.round(FIN_UNITS * UI_SCALE * dpr));
  return {
    w: wDev / dpr,
    h: (bottomDev - topDev) / dpr,
    unit: finSizeDev / dpr / FIN_UNITS,
  };
}

/**
 * Слой рисуется для КАЖДОГО пузыря (без хвоста — чистая коробка). Заливка
 * тела пузыря остаётся CSS (фон пузыря), слой рисует только границу и
 * заливку плавника. side — сторона хвоста (только последний пузырь серии).
 */
export function BubbleOutline({
  side,
  variant,
}: {
  side: 'left' | 'right' | null;
  variant: 'default' | 'card';
}) {
  const clipId = `bubble-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const layerRef = useRef<SVGSVGElement>(null);
  const [geom, setGeom] = useState<LayerGeom | null>(null);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => setGeom(measureLayer(el.getBoundingClientRect()));
    measure();
    // jsdom/старые среды без ResizeObserver: слой останется без геометрии —
    // тесты рисование контура не проверяют.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <svg
      ref={layerRef}
      aria-hidden
      data-slot="bubble-outline"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      {geom ? (
        <>
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={outlinePath(geom.w, geom.h, side, geom.unit)} />
            </clipPath>
          </defs>
          {/* ЕДИНАЯ ЗАЛИВКА: весь силуэт (коробка+плавник) одним путём —
              тинт/фона единый, без второй заливки и её прямоугольника.
              Классы fill-bubble-* — те же правила тинта (globals.css). */}
          <path
            d={outlinePath(geom.w, geom.h, side, geom.unit)}
            className={variant === 'card' ? 'fill-bubble-in' : 'fill-bubble-out'}
          />
          {/* ЕДИНАЯ граница: коробка + хвост одним контуром, штрих [0,2]css
              внутрь + прикрытие [0,1] цветом заливки, клип по силуэту —
              видимая полоса [1,2]css по ВСЕМУ периметру одной линией.
              Цветом управляет globals.css. */}
          <path
            className="bubble-ring"
            d={outlinePath(geom.w, geom.h, side, geom.unit)}
            fill="none"
            strokeWidth={RING_STROKE_CSS}
            clipPath={`url(#${clipId})`}
          />
          <path
            className="bubble-ring-cover"
            d={outlinePath(geom.w, geom.h, side, geom.unit)}
            fill="none"
            strokeWidth={COVER_STROKE_CSS}
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : null}
    </svg>
  );
}
