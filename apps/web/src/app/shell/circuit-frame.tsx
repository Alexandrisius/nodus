import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

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
  const [pulse, setPulse] = useState<{
    points: NodeEdgePoint[];
    dot: boolean;
    kind: 'nav' | 'rail';
  } | null>(null);
  const [pulseRun, setPulseRun] = useState(0);
  const prevFocus = useRef<CircuitFocus | null>(null);
  /** Состояние правой панели (раскрыта ли) — фронт-детекция для вспышки. */
  const railExpanded = useRef(false);
  const railPulseTimer = useRef(0);

  const pulseTimer = useRef(0);

  /** Одиночный пульс с авто-затуханием (общая механика для всех триггеров). */
  const firePulse = useCallback((points: NodeEdgePoint[], dot: boolean, kind: 'nav' | 'rail') => {
    window.clearTimeout(pulseTimer.current);
    setPulse({ points, dot, kind });
    setPulseRun((k) => k + 1);
    pulseTimer.current = window.setTimeout(() => setPulse(null), PULSE_FADE_MS);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    let loop = 0;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGeo(measureCircuit()));
    };
    // Плавный пересчёт КАЖДЫЙ КАДР во время transition — контур и точка
    // узла идут за панелью без ступенек и вибрации.
    const onTransitionRun = () => {
      if (loop) return;
      const tick = () => {
        setGeo(measureCircuit());
        loop = requestAnimationFrame(tick);
      };
      loop = requestAnimationFrame(tick);
    };
    const onTransitionEnd = () => {
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
  }, [pathname, searchStr, menuCollapsed, railCollapsed]);

  useLayoutEffect(() => {
    if (!geo) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Вспышка навигации — только на смену фокуса (не на движение панелей)
    const next = currentFocus(geo);
    if (!reduced && focusSig(next) !== focusSig(prevFocus.current)) {
      const p = transitionPulse(geo, prevFocus.current);
      if (p) firePulse(p.points, p.dot, 'nav');
    }
    prevFocus.current = next;

    // Вспышка на РАСКРЫТИЕ правой панели: ровно одна на фронт «схлопнута →
    // раскрыта», старт — от порта АКТИВНОГО МОДУЛЯ, огонь — после окончания
    // transition по финальной геометрии (иначе узел ещё едет и пульс перелетает
    // его внутрь панели). Схлопывание гасит недолетевший пульс мгновенно —
    // подсвеченная траектория не остаётся висеть на прежнем месте.
    const expandedNow = geo.rightRailWidth !== null && geo.rightRailWidth > 150;
    if (expandedNow && !railExpanded.current && !reduced) {
      window.clearTimeout(railPulseTimer.current);
      railPulseTimer.current = window.setTimeout(() => {
        const g = measureCircuit();
        if (!g?.rightNode) return;
        const active = g.modules.find((m) => m.active);
        const points: NodeEdgePoint[] = active
          ? [
              active.port,
              { x: g.junction.x, y: active.port.y },
              g.junction,
              { x: g.rightNode.x, y: g.axisY },
            ]
          : [g.junction, { x: g.rightNode.x, y: g.axisY }];
        firePulse(points, true, 'rail');
      }, 350);
    }
    if (!expandedNow) {
      window.clearTimeout(railPulseTimer.current);
      setPulse((p) => (p?.kind === 'rail' ? null : p));
    }
    railExpanded.current = expandedNow;
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
        {geo.logoDot ? (
          <circle
            cx={geo.logoDot.x}
            cy={geo.logoDot.y}
            r="3"
            fill={geo.modules.find((m) => m.active)?.to === '/' ? 'var(--port)' : 'var(--sidebar)'}
            stroke={geo.modules.find((m) => m.active)?.to === '/' ? 'var(--port)' : 'var(--edge)'}
            style={
              geo.modules.find((m) => m.active)?.to === '/'
                ? { filter: 'drop-shadow(0 0 6px var(--glow))' }
                : undefined
            }
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
