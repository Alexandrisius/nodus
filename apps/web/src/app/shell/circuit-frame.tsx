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
    fadeMs: number;
    fading?: boolean;
  } | null>(null);
  const [pulseRun, setPulseRun] = useState(0);
  const prevFocus = useRef<CircuitFocus | null>(null);
  /** Состояние правой панели (раскрыта ли) — фронт-детекция для вспышки. */
  const railExpanded = useRef(false);
  const railPulseTimer = useRef(0);

  const pulseTimer = useRef(0);
  const dissolveTimer = useRef(0);
  /** Тип живого пульса — dissolve трогает только rail-пульсы (не гасит nav). */
  const pulseKind = useRef<'nav' | 'rail' | null>(null);

  /** Одиночный пульс с авто-затуханием; длительность затухания — из длины
   * маршрута (рисовка + пробег + догорать), иначе дальний пульс обрывается. */
  const firePulse = useCallback((points: NodeEdgePoint[], dot: boolean, kind: 'nav' | 'rail') => {
    window.clearTimeout(pulseTimer.current);
    window.clearTimeout(dissolveTimer.current);
    const len = pathLength(points);
    const fadeMs = (len / 1200 + len / 400 + 0.9) * 1000;
    pulseKind.current = kind;
    setPulse({ points, dot, kind, fadeMs });
    setPulseRun((k) => k + 1);
    pulseTimer.current = window.setTimeout(() => {
      pulseKind.current = null;
      setPulse(null);
    }, fadeMs);
  }, []);

  /** Плавное гашение пульса панели при её схлопывании (не резкий обрыв). */
  const dissolveRailPulse = useCallback(() => {
    if (pulseKind.current !== 'rail') return;
    pulseKind.current = null;
    window.clearTimeout(pulseTimer.current);
    setPulse((p) => (p ? { ...p, fading: true } : p));
    dissolveTimer.current = window.setTimeout(() => setPulse(null), 300);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    let loop = 0;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGeo(measureCircuit(pathname)));
    };
    // Плавный пересчёт КАЖДЫЙ КАДР во время transition ШИРИНЫ панелей —
    // контур и точка узла идут за панелью без ступенек и вибрации. Фильтр
    // propertyName: иначе цикл гаснет по transitionend посторонних анимаций
    // (затухания имён и т.п.) раньше окончания движения панели — связь врала.
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
        const g = measureCircuit(pathname);
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
    if (!expandedNow && railExpanded.current) {
      window.clearTimeout(railPulseTimer.current);
      dissolveRailPulse();
    }
    railExpanded.current = expandedNow;
  }, [geo, firePulse, dissolveRailPulse]);

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
          className={
            pulse.fading
              ? 'absolute inset-0 opacity-0 transition-opacity duration-300'
              : 'dock-edge-fade absolute inset-0'
          }
          style={pulse.fading ? undefined : { animationDuration: `${pulse.fadeMs}ms` }}
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
