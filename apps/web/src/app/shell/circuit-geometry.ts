import { orthPath, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import { RAIL_TRUNK_X } from './node-rail.js';

/** Измеренная геометрия контура: порты из DOM по data-атрибутам. */
export interface CircuitGeometry {
  /** Стык шины рейки и оси шапки (корень контура). */
  junction: NodeEdgePoint;
  /** Y оси бордюра шапки. */
  axisY: number;
  modules: { to: string; active: boolean; port: NodeEdgePoint }[];
  /** Центры вкладок топбара (x), активность. */
  tabs: { active: boolean; x: number }[];
  /** Узел правой панели (лежит на оси). */
  rightNode: NodeEdgePoint | null;
  /** Низ шины рейки (центр последнего модуля). */
  spineEndY: number;
}

/** Фокус навигации: активный модуль и вкладка (для вспышки-перехода). */
export interface CircuitFocus {
  moduleTo: string;
  modulePort: NodeEdgePoint;
  tabX: number | null;
}

function centerOf(el: Element): NodeEdgePoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Измерение контура из живого DOM. Возвращает null, если каркас не смонтирован. */
export function measureCircuit(): CircuitGeometry | null {
  const header = document.querySelector<HTMLElement>('[data-topbar]');
  if (!header) return null;
  const axisY = header.getBoundingClientRect().bottom;
  const modules = [...document.querySelectorAll<HTMLElement>('[data-module-port]')].map((el) => ({
    to: el.dataset.modulePort ?? '',
    active: el.dataset.active === 'true',
    port: centerOf(el),
  }));
  const tabs = [...document.querySelectorAll<HTMLElement>('[data-tab-port]')].map((el) => ({
    active: el.dataset.active === 'true',
    x: centerOf(el).x,
  }));
  const rightEl = document.querySelector<HTMLElement>('[data-circuit-node]');
  return {
    junction: { x: RAIL_TRUNK_X, y: axisY },
    axisY,
    modules,
    tabs,
    rightNode: rightEl ? centerOf(rightEl) : null,
    spineEndY: modules.length ? Math.max(...modules.map((m) => m.port.y)) : axisY,
  };
}

/** Статичный контур: артерия — ОДНА ломаная «низ шины → стык (круглое
 * сопряжение) → ось → правый узел» (без прямых углов и точек в стыке);
 * отводы модулей локтями; засечки вкладок — локти в сторону главного меню. */
export function framePath(g: CircuitGeometry): string {
  const parts: string[] = [];
  const rightEnd = g.rightNode?.x ?? g.junction.x + 200;
  parts.push(
    orthPath(
      [
        { x: g.junction.x, y: g.modules.length > 0 ? g.spineEndY : g.axisY },
        g.junction,
        { x: rightEnd, y: g.axisY },
      ],
      8,
    ),
  );
  for (const m of g.modules) {
    parts.push(
      orthPath(
        [
          { x: g.junction.x, y: m.port.y - 10 },
          { x: g.junction.x, y: m.port.y },
          { x: m.port.x - 4, y: m.port.y },
        ],
        8,
      ),
    );
  }
  // Узел правой панели лежит на оси — загиб рисуем только при реальном смещении.
  if (g.rightNode && Math.abs(g.rightNode.y - g.axisY) >= 12) {
    parts.push(
      orthPath(
        [
          { x: g.rightNode.x, y: g.axisY },
          { x: g.rightNode.x, y: g.rightNode.y - 5 },
        ],
        8,
      ),
    );
  }
  for (const t of g.tabs) {
    parts.push(
      orthPath(
        [
          { x: t.x - 10, y: g.axisY },
          { x: t.x, y: g.axisY },
          { x: t.x, y: g.axisY - TICK },
        ],
        6,
      ),
    );
  }
  return parts.filter(Boolean).join(' ');
}

/** Длина засечки-ответвления вкладки (точка — у самого пункта, не на оси). */
export const TICK = 12;

/** Отвод к активному модулю — подсвечивается отдельным слоем. */
export function activeBranchPath(g: CircuitGeometry): string | null {
  const m = g.modules.find((item) => item.active);
  if (!m) return null;
  return orthPath(
    [
      { x: g.junction.x, y: m.port.y - 10 },
      { x: g.junction.x, y: m.port.y },
      { x: m.port.x - 4, y: m.port.y },
    ],
    8,
  );
}

/** Текущий фокус навигации (активные модуль и вкладка). */
export function currentFocus(g: CircuitGeometry): CircuitFocus | null {
  const active = g.modules.find((m) => m.active);
  if (!active) return null;
  const activeTab = g.tabs.find((t) => t.active);
  return { moduleTo: active.to, modulePort: active.port, tabX: activeTab?.x ?? null };
}

/**
 * Вспышка-переход — строго один пульс в одну сторону, всегда ОТ ПОРТА МОДУЛЯ:
 * по шине и оси к точке активной вкладки (клик по модулю и клик по вкладке —
 * одна и та же траектория, пересечений нет по построению); у модуля без
 * вкладок — поворот за стык и затухание на оси без точки. Логотип не участвует.
 * dot=true — на конце пульса точка в целевом порту; false — без точки (стык).
 */
export function transitionPulse(
  g: CircuitGeometry,
  prev: CircuitFocus | null,
): { points: NodeEdgePoint[]; dot: boolean } | null {
  const active = g.modules.find((m) => m.active);
  if (!active) return null;
  const activeTab = g.tabs.find((t) => t.active);
  const focusChanged = !prev || prev.moduleTo !== active.to || prev.tabX !== (activeTab?.x ?? null);
  if (!focusChanged) return null;
  if (activeTab) {
    return {
      points: [
        active.port,
        { x: g.junction.x, y: active.port.y },
        g.junction,
        { x: activeTab.x, y: g.axisY },
        { x: activeTab.x, y: g.axisY - TICK },
      ],
      dot: true,
    };
  }
  return {
    points: [
      active.port,
      { x: g.junction.x, y: active.port.y },
      g.junction,
      { x: g.junction.x + 24, y: g.axisY },
    ],
    dot: false,
  };
}
