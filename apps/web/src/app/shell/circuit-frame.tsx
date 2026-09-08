import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, pathLength, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import {
  currentFocus,
  framePath,
  measureCircuit,
  TICK,
  transitionPulse,
  type CircuitFocus,
  type CircuitGeometry,
} from './circuit-geometry.js';
import { useShellStore } from './shell-store.js';

function focusSig(f: CircuitFocus | null): string {
  return f ? `${f.moduleTo}|${f.tabLabel ?? ''}` : '';
}

/**
 * Перманентный контур Nodus (реф node-based UI): единая связь слева направо —
 * стык (круглое сопряжение, без точки) → ось шапки до самого правого края
 * (контур ЗАМЕНЯЕТ бордюр и сливается с классической разметкой) — плюс шина
 * рейки с локтевыми отводами к портам модулей единым блоком и засечки вверх
 * к точкам вкладок (точка — у самого пункта, на оси точек нет). Вспышка —
 * один пульс к активному подменю, только на СМЕНУ фокуса (не на движение
 * панелей и не на resize). Геометрия — измерение DOM по data-атрибутам;
 * пересчёт на resize, скролл навигатора и покадрово во время transition
 * ширины панелей.
 */
export function CircuitFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const menuCollapsed = useShellStore((s) => s.menuCollapsed);
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  const [pulse, setPulse] = useState<{
    points: NodeEdgePoint[];
    dot: boolean;
    fadeMs: number;
  } | null>(null);
  const [pulseRun, setPulseRun] = useState(0);
  const prevFocus = useRef<CircuitFocus | null>(null);

  const pulseTimer = useRef(0);

  /** Одиночный пульс с авто-затуханием; длительность затухания — из длины
   * маршрута (рисовка + пробег + догорать), иначе дальний пульс обрывается. */
  const firePulse = useCallback((points: NodeEdgePoint[], dot: boolean) => {
    window.clearTimeout(pulseTimer.current);
    const len = pathLength(points);
    const fadeMs = (len / 1200 + len / 400 + 0.9) * 1000;
    setPulse({ points, dot, fadeMs });
    setPulseRun((k) => k + 1);
    pulseTimer.current = window.setTimeout(() => setPulse(null), fadeMs);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    let loop = 0;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGeo(measureCircuit(pathname)));
    };
    // Плавный пересчёт КАЖДЫЙ КАДР во время transition ШИРИНЫ панелей —
    // контур идёт за панелью без ступенек. Фильтр propertyName: иначе цикл
    // гаснет по transitionend посторонних анимаций раньше окончания движения.
    const onTransitionRun = (e: TransitionEvent) => {
      if (e.propertyName !== 'width' || loop) return;
      const tick = () => {
        setGeo(measureCircuit(pathname));
        loop = requestAnimationFrame(tick);
      };
      loop = requestAnimationFrame(tick);
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'width') return;
      cancelAnimationFrame(loop);
      loop = 0;
      remeasure();
    };
    remeasure();
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.documentElement);
    document.addEventListener('transitionrun', onTransitionRun, true);
    document.addEventListener('transitionend', onTransitionEnd, true);
    document.addEventListener('transitioncancel', onTransitionEnd, true);
    document.addEventListener('scroll', remeasure, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(loop);
      ro.disconnect();
      document.removeEventListener('transitionrun', onTransitionRun, true);
      document.removeEventListener('transitionend', onTransitionEnd, true);
      document.removeEventListener('transitioncancel', onTransitionEnd, true);
      document.removeEventListener('scroll', remeasure, { capture: true });
    };
  }, [pathname, searchStr, menuCollapsed]);

  useLayoutEffect(() => {
    if (!geo) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Вспышка навигации — только на смену фокуса (не на движение панелей)
    const next = currentFocus(geo);
    if (!reduced && focusSig(next) !== focusSig(prevFocus.current)) {
      const p = transitionPulse(geo, prevFocus.current);
      if (p) firePulse(p.points, p.dot);
    }
    prevFocus.current = next;
  }, [geo, firePulse]);

  if (!geo) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <path
          d={framePath(geo)}
          fill="none"
          stroke="var(--foreground)"
          strokeOpacity="0.32"
          strokeWidth="1"
        />
        {geo.tabs.map((t) => (
          <circle
            key={t.x}
            cx={t.x}
            cy={geo.axisY - TICK}
            r="2.5"
            fill={t.active ? 'var(--port)' : 'var(--background)'}
            stroke={t.active ? 'var(--port)' : 'var(--edge)'}
            style={t.active ? { filter: 'drop-shadow(0 0 6px var(--glow))' } : undefined}
          />
        ))}
      </svg>
      {pulse ? (
        <div
          key={pulseRun}
          className="dock-edge-fade absolute inset-0"
          style={{ animationDuration: `${pulse.fadeMs}ms` }}
        >
          <NodeEdge
            points={pulse.points}
            ports={pulse.dot ? 'end' : 'none'}
            drawOn
            pulse="once"
            active
          />
        </div>
      ) : null}
    </div>
  );
}
