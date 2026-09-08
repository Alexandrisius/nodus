import { useLayoutEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import {
  activeBranchPath,
  framePath,
  measureCircuit,
  pulsePaths,
  type CircuitGeometry,
} from './circuit-geometry.js';
import { useShellStore } from './shell-store.js';

const PULSE_FADE_MS = 2200;

/**
 * Перманентный контур Nodus (фишка каркаса, реф node-based UI): единая связь
 * слева направо по верху портала — логотип → ось шапки (контур ЗАМЕНЯЕТ бордюр
 * шапки, дубля линий нет) → узел правой панели — плюс шина рейки с локтевыми
 * отводами к портам модулей единым блоком. Статика видна всегда; по контуру
 * при навигации бегут вспышки-пульсы — концы строго в портах.
 * Геометрия — измерение DOM по data-атрибутам (никаких констант координат):
 * новый модуль/вкладка достраивают контур сами; пересчёт на resize и
 * transitionend (схлопывание панелей).
 */
export function CircuitFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const menuCollapsed = useShellStore((s) => s.menuCollapsed);
  const railCollapsed = useShellStore((s) => s.railCollapsed);
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  const [pulses, setPulses] = useState<NodeEdgePoint[][]>([]);
  const lastNav = useRef('');

  useLayoutEffect(() => {
    let raf = 0;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGeo(measureCircuit()));
    };
    remeasure();
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.documentElement);
    document.addEventListener('transitionend', remeasure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('transitionend', remeasure, true);
    };
  }, [pathname, searchStr, menuCollapsed, railCollapsed]);

  useLayoutEffect(() => {
    const id = `${pathname}|${searchStr}`;
    if (!geo || lastNav.current === id) return;
    lastNav.current = id;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPulses(pulsePaths(geo));
    const timer = window.setTimeout(() => setPulses([]), PULSE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [geo, pathname, searchStr]);

  if (!geo) return null;
  const activeBranch = activeBranchPath(geo);
  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <path
          d={framePath(geo)}
          fill="none"
          stroke="var(--edge)"
          strokeOpacity="0.8"
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
        <circle cx={geo.junction.x} cy={geo.junction.y} r="2.5" fill="var(--port)" />
      </svg>
      {pulses.length > 0 && (
        <div key={lastNav.current} className="dock-edge-fade absolute inset-0">
          {pulses.map((pts, i) => (
            <NodeEdge key={i} points={pts} drawOn pulse="once" active />
          ))}
        </div>
      )}
    </div>
  );
}
