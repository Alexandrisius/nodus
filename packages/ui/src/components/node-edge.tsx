import { useEffect, useMemo, useState } from 'react';
import { cn } from '#lib/utils';

export interface NodeEdgePoint {
  x: number;
  y: number;
}

/** H/V-ломаная со скруглением elbow в промежуточных узлах (манхэттенская геометрия). */
export function orthPath(points: NodeEdgePoint[], r: number): string {
  if (points.length < 2) return '';
  const first = points[0];
  if (!first) return '';
  const parts = [`M${first.x},${first.y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!prev || !curr || !next) continue;
    const dx1 = Math.sign(curr.x - prev.x);
    const dy1 = Math.sign(curr.y - prev.y);
    const dx2 = Math.sign(next.x - curr.x);
    const dy2 = Math.sign(next.y - curr.y);
    const r1 = Math.min(r, Math.hypot(curr.x - prev.x, curr.y - prev.y) / 2);
    const r2 = Math.min(r, Math.hypot(next.x - curr.x, next.y - curr.y) / 2);
    parts.push(`L${curr.x - dx1 * r1},${curr.y - dy1 * r1}`);
    parts.push(`Q${curr.x},${curr.y} ${curr.x + dx2 * r2},${curr.y + dy2 * r2}`);
  }
  const last = points[points.length - 1];
  if (last) parts.push(`L${last.x},${last.y}`);
  return parts.join(' ');
}

/**
 * Снаппинг к сетке ФИЗИЧЕСКИХ пикселей. Линия 1px, центрированная между
 * device-пикселями, покрывает два по 50% — прямые сегменты БЛЕДНЕЕ кривых
 * того же пути (anti-aliasing локтей даёт почти полное покрытие). Центр на
 * полупиксельной сетке device-пикселей покрывает ровно один ряд — линия
 * чёткая и одинаково яркая на всём пути. dpr обязателен: при зуме браузера
 * 90% 1 CSS px = 0.9 device px и CSS-сетка x.5 уплывает (видно как «яркие
 * хвостики» при зуме ≤ 100%). Применять к path И портам согласованно.
 */
export function snapToPixel(v: number, dpr: number): number {
  return (Math.round(v * dpr - 0.5) + 0.5) / dpr;
}

/** Текущий devicePixelRatio с переподпиской при зуме браузера (канон:
 * matchMedia resolution пересоздаётся на каждый новый dpr). */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() =>
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [dpr]);
  return dpr;
}

/** Длина ломаной в px (сегменты ортогональные — hypot == манхэттен). */
export function pathLength(points: NodeEdgePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Скорости анимаций — px/s: длительность = длина / скорость (одинаковая
 * скорость вспышки на коротких и дальних маршрутах; темп — как у ближних). */
const PULSE_SPEED = 400;
const DRAW_SPEED = 1200;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Ортогональное ребро «инструмента» (реф node-based UI): сегменты под прямыми
 * углами, порты-точки на концах, опциональные отрисовка при появлении (drawOn)
 * и пульс (SMIL, без JS-цикла). Координаты — пиксели позиционируемого
 * контейнера; svg растянут на него (absolute inset-0, overflow visible).
 * Перемонтирование (key) перезапускает одноразовые анимации.
 */
function NodeEdge({
  points,
  pulse = false,
  active = false,
  drawOn = false,
  ports = 'both',
  elbow = 8,
  className,
}: {
  points: NodeEdgePoint[];
  /** true — пульс бегает бесконечно; 'once' — один пробег при монтировании. */
  pulse?: boolean | 'once';
  active?: boolean;
  /** Отрисовка линии от начала к концу при монтировании. */
  drawOn?: boolean;
  /** Порты-точки: на обоих концах, только в целевом или без точек. */
  ports?: 'both' | 'end' | 'none';
  elbow?: number;
  className?: string;
}) {
  // Координаты снаппятся к сетке ФИЗИЧЕСКИХ пикселей (snapToPixel с живым
  // devicePixelRatio — иначе при зуме ≠ 100% прямые бледнее локтей);
  // path и порты снаппятся согласованно.
  const dpr = useDevicePixelRatio();
  const snapped = useMemo(
    () => points.map((p) => ({ x: snapToPixel(p.x, dpr), y: snapToPixel(p.y, dpr) })),
    [points, dpr],
  );
  const d = useMemo(() => orthPath(snapped, elbow), [snapped, elbow]);
  const len = useMemo(() => pathLength(points), [points]);
  const reduced = useReducedMotion();
  if (points.length < 2) return null;
  const start = snapped[0];
  const end = snapped[snapped.length - 1];
  if (!start || !end) return null;
  const animate = drawOn && !reduced;
  // Длительности из длины маршрута — скорость вспышки одинакова на всех путях.
  const drawDur = Math.max(len / DRAW_SPEED, 0.15);
  const pulseDur = Math.max(len / PULSE_SPEED, 0.3);
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full overflow-visible',
        className,
      )}
    >
      <path
        d={d}
        fill="none"
        stroke={active ? 'var(--foreground)' : 'var(--edge)'}
        strokeWidth={1}
        pathLength={animate ? 1 : undefined}
        className={animate ? 'node-edge-draw' : undefined}
        style={{
          ...(animate ? { animationDuration: `${drawDur}s` } : null),
          ...(active ? { filter: 'drop-shadow(0 0 6px var(--glow))' } : null),
        }}
      />
      {ports !== 'none' &&
        (ports === 'both' ? [start, end] : [end]).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--port)" />
        ))}
      {pulse && !reduced && (
        <circle r={2.5} fill="var(--port)" opacity={0}>
          {/* fill=freeze — после пробега кружок остаётся в конце пути, иначе
              SMIL возвращает его в (0,0): «светящийся пиксель» в левом верхнем
              углу. opacity-гейт — до старта движения кружок невидим. */}
          <animateMotion
            dur={`${pulseDur}s`}
            begin={drawOn ? `${drawDur}s` : '0s'}
            repeatCount={pulse === 'once' ? '1' : 'indefinite'}
            path={d}
            fill="freeze"
          />
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            begin={drawOn ? `${drawDur}s` : '0s'}
            dur="0.01s"
            fill="freeze"
          />
        </circle>
      )}
    </svg>
  );
}

export { NodeEdge };
