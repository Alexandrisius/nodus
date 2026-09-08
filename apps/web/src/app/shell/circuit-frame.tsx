import { useLayoutEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import {
  activeBranchPath,
  currentFocus,
  framePath,
  measureCircuit,
  transitionPulse,
  type CircuitFocus,
  type CircuitGeometry,
} from './circuit-geometry.js';
import { useShellStore } from './shell-store.js';

const PULSE_FADE_MS = 2200;

/**
 * Перманентный контур Nodus (фишка каркаса, реф node-based UI): единая связь
 * слева направо — стык → ось шапки (контур ЗАМЕНЯЕТ бордюр шапки) → узел
 * правой панели — плюс шина рейки с локтевыми отводами к портам модулей
 * единым блоком и засечки-ответвления вверх к вкладкам. Логотип в контур
 * не входит. Вспышка — один пульс от предыдущего фокуса к нажатому порту.
 * Геометрия — измерение DOM по data-атрибутам (без констант координат);
 * пересчёт на resize и transitionend (схлопывание панелей).
 */
export function CircuitFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const menuCollapsed = useShellStore((s) => s.menuCollapsed);
  const railCollapsed = useShellStore((s) => s.railCollapsed);
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  const [pulse, setPulse] = useState<NodeEdgePoint[] | null>(null);
  const [pulseKey, setPulseKey] = useState('');
  const prevFocus = useRef<CircuitFocus | null>(null);

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
    if (!geo) return;
    const id = `${pathname}|${searchStr}`;
    if (id === pulseKey) return;
    const next = currentFocus(geo);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const path = transitionPulse(geo, prevFocus.current);
      if (path) {
        setPulse(path);
        setPulseKey(id);
        const timer = window.setTimeout(() => setPulse(null), PULSE_FADE_MS);
        return () => window.clearTimeout(timer);
      }
    }
    prevFocus.current = next;
    return undefined;
  }, [geo, pathname, searchStr, pulseKey]);

  // Фокус обновляем после построения вспышки (или если она не понадобилась)
  useLayoutEffect(() => {
    if (!geo) return;
    prevFocus.current = currentFocus(geo);
  }, [pulseKey, geo]);

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
        <circle cx={geo.junction.x} cy={geo.junction.y} r="2.5" fill="var(--port)" />
        {geo.tabs.map((t) => (
          <circle
            key={t.x}
            cx={t.x}
            cy={geo.axisY - 7}
            r="2"
            fill="var(--background)"
            stroke="var(--edge)"
          />
        ))}
      </svg>
      {pulse ? (
        <div key={pulseKey} className="dock-edge-fade absolute inset-0">
          <NodeEdge points={pulse} drawOn pulse="once" active />
        </div>
      ) : null}
    </div>
  );
}
