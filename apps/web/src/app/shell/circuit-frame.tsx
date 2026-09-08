import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import {
  activeBranchPath,
  currentFocus,
  framePath,
  measureCircuit,
  TICK,
  transitionPulse,
  type CircuitFocus,
  type CircuitGeometry,
} from './circuit-geometry.js';
import { useShellStore } from './shell-store.js';

const PULSE_FADE_MS = 2200;

function focusSig(f: CircuitFocus | null): string {
  return f ? `${f.moduleTo}|${f.tabX ?? ''}` : '';
}

/**
 * Перманентный контур Nodus (реф node-based UI): единая связь слева направо —
 * стык (круглое сопряжение, без точки) → ось шапки (контур ЗАМЕНЯЕТ бордюр) →
 * нода правой панели (длина следует за её движением) — плюс шина рейки с
 * локтевыми отводами к портам модулей единым блоком и засечки вверх к точкам
 * вкладок (точка — у самого пункта, на оси точек нет). Вспышка — один пульс
 * к активному подменю, только на СМЕНУ фокуса (не на движение панелей).
 * Геометрия — измерение DOM по data-атрибутам; пересчёт на resize, скролл
 * навигатора и непрерывно во время transition панелей.
 */
export function CircuitFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const menuCollapsed = useShellStore((s) => s.menuCollapsed);
  const railCollapsed = useShellStore((s) => s.railCollapsed);
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  const [pulse, setPulse] = useState<{ points: NodeEdgePoint[]; dot: boolean } | null>(null);
  const [pulseRun, setPulseRun] = useState(0);
  const prevFocus = useRef<CircuitFocus | null>(null);
  const prevRailWidth = useRef<number | null>(null);

  const pulseTimer = useRef(0);

  /** Одиночный пульс с авто-затуханием (общая механика для всех триггеров). */
  const firePulse = useCallback((points: NodeEdgePoint[], dot: boolean) => {
    window.clearTimeout(pulseTimer.current);
    setPulse({ points, dot });
    setPulseRun((k) => k + 1);
    pulseTimer.current = window.setTimeout(() => setPulse(null), PULSE_FADE_MS);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    let transitionTimer = 0;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGeo(measureCircuit()));
    };
    // Непрерывный пересчёт во время transition (панели движутся — связь тянется)
    const onTransitionRun = () => {
      transitionTimer = window.setInterval(remeasure, 50);
    };
    const onTransitionEnd = () => {
      window.clearInterval(transitionTimer);
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
      window.clearInterval(transitionTimer);
      ro.disconnect();
      document.removeEventListener('transitionrun', onTransitionRun, true);
      document.removeEventListener('transitionend', onTransitionEnd, true);
      document.removeEventListener('transitioncancel', onTransitionEnd, true);
      document.removeEventListener('scroll', remeasure, { capture: true });
    };
  }, [pathname, searchStr, menuCollapsed, railCollapsed]);

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

    // Вспышка на РАСКРЫТИЕ правой панели (ширина выросла ≥ 24px; схлопывание — нет)
    if (!reduced && geo.rightNode && geo.rightRailWidth !== null) {
      const prevW = prevRailWidth.current;
      if (prevW !== null && geo.rightRailWidth >= prevW + 24) {
        firePulse([geo.junction, { x: geo.rightNode.x, y: geo.axisY }], true);
      }
    }
    prevRailWidth.current = geo.rightRailWidth;
  }, [geo, firePulse]);

  if (!geo) return null;
  const activeBranch = activeBranchPath(geo);
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
        {activeBranch ? (
          <path
            d={activeBranch}
            fill="none"
            stroke="var(--port)"
            strokeOpacity="0.9"
            strokeWidth="1"
          />
        ) : null}
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
        {geo.rightNode ? (
          <circle
            cx={geo.rightNode.x}
            cy={geo.axisY}
            r="3.5"
            fill="var(--sidebar)"
            stroke="var(--edge)"
          />
        ) : null}
      </svg>
      {pulse ? (
        <div key={pulseRun} className="dock-edge-fade absolute inset-0">
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
