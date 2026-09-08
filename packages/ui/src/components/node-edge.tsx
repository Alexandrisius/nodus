import { useEffect, useMemo, useState } from 'react';
import { cn } from '#lib/utils';

export interface NodeEdgePoint {
  x: number;
  y: number;
}

/** H/V-ломаная со скруглением elbow в промежуточных узлах (манхэттенская геометрия). */
function orthPath(points: NodeEdgePoint[], r: number): string {
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
 * углами, порты-точки на концах, опциональный пульс (SMIL, без JS-цикла).
 * Координаты — пиксели позиционируемого контейнера; svg растянут на него
 * (absolute inset-0, overflow visible для свечения).
 */
function NodeEdge({
  points,
  pulse = false,
  active = false,
  elbow = 8,
  className,
}: {
  points: NodeEdgePoint[];
  /** true — пульс бегает бесконечно; 'once' — один пробег при монтировании. */
  pulse?: boolean | 'once';
  active?: boolean;
  elbow?: number;
  className?: string;
}) {
  const d = useMemo(() => orthPath(points, elbow), [points, elbow]);
  const reduced = useReducedMotion();
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return null;
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
        style={active ? { filter: 'drop-shadow(0 0 6px var(--glow))' } : undefined}
      />
      {[start, end].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--port)" />
      ))}
      {pulse && !reduced && (
        <circle r={2.5} fill="var(--port)">
          <animateMotion dur="1.4s" repeatCount={pulse === 'once' ? '1' : 'indefinite'} path={d} />
        </circle>
      )}
    </svg>
  );
}

export { NodeEdge };
