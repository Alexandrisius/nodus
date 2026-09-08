import { orthPath, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import { RAIL_TRUNK_X } from './node-rail.js';

/** Измеренная геометрия контура: порты из DOM по data-атрибутам. */
export interface CircuitGeometry {
  /** Стык шины рейки и оси шапки (корень контура). */
  junction: NodeEdgePoint;
  /** Y оси бордюра шапки. */
  axisY: number;
  modules: { to: string; active: boolean; port: NodeEdgePoint }[];
  /** Центры вкладок топбара (x), активность, подпись (идентичность вкладки). */
  tabs: { active: boolean; x: number; label: string }[];
  /** Узел схлопнутой левой рейки (точка на её боковом шве; null — рейка развёрнута). */
  leftNode: NodeEdgePoint | null;
  /** Правый край вьюпорта — ось уходит до самого конца, как обычный бордюр. */
  rightEdge: number;
  /** Низ шины рейки (центр последнего модуля). */
  spineEndY: number;
}

/** Фокус навигации: активный модуль и вкладка (для вспышки-перехода). */
export interface CircuitFocus {
  moduleTo: string;
  modulePort: NodeEdgePoint;
  /** Подпись активной вкладки — идентичность (не x: сдвиг геометрии при
   * сворачивании панелей/resize фокусом не является и вспышки не вызывает). */
  tabLabel: string | null;
}

function centerOf(el: Element): NodeEdgePoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Измерение контура из живого DOM. Возвращает null, если каркас не смонтирован. */
export function measureCircuit(pathname = '/'): CircuitGeometry | null {
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
    label: el.textContent?.trim() ?? '',
  }));
  const leftEl = document.querySelector<HTMLElement>('[data-left-node]');
  const leftNode = leftEl ? centerOf(leftEl) : null;
  const lastY = modules.length ? Math.max(...modules.map((m) => m.port.y)) : axisY;
  // Схлопнутая рейка: стык — правый край узла бокового шва (точка 5px);
  // «виртуальный» активный модуль опирает вспышки на ось (портов внутри
  // панели нет); to — реальный маршрут, чтобы сигнатура фокуса не дёргалась
  // при развороте.
  const junction: NodeEdgePoint = leftNode
    ? { x: leftNode.x + 2.5, y: axisY }
    : { x: RAIL_TRUNK_X, y: axisY };
  return {
    junction,
    axisY,
    modules: leftNode ? [{ to: pathname, active: true, port: junction }] : modules,
    tabs,
    leftNode,
    rightEdge: document.documentElement.clientWidth,
    // Шина заканчивается в точке отхода последнего отвода (порт-10) — без хвоста.
    spineEndY: leftNode ? axisY : modules.length ? lastY - 10 : axisY,
  };
}

/** Статичный контур: артерия — ОДНА ломаная «низ шины → стык (круглое
 * сопряжение) → ось до правого края вьюпорта» (как обычный бордюр; без
 * прямых углов и точек в стыке); отводы модулей локтями; засечки вкладок —
 * локти в сторону главного меню. */
export function framePath(g: CircuitGeometry): string {
  const parts: string[] = [];
  parts.push(
    orthPath(
      [
        { x: g.junction.x, y: g.leftNode ? g.axisY : g.modules.length > 0 ? g.spineEndY : g.axisY },
        g.junction,
        { x: g.rightEdge, y: g.axisY },
      ],
      8,
    ),
  );
  for (const m of g.modules) {
    // Отвод рисуем, только если порт вынесен от шины (у схлопнутой рейки
    // и виртуального модуля отвода нет).
    if (m.port.x - g.junction.x < 8) continue;
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

/** Текущий фокус навигации (активные модуль и вкладка). */
export function currentFocus(g: CircuitGeometry): CircuitFocus | null {
  const active = g.modules.find((m) => m.active);
  if (!active) return null;
  const activeTab = g.tabs.find((t) => t.active);
  return { moduleTo: active.to, modulePort: active.port, tabLabel: activeTab?.label ?? null };
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
  const focusChanged =
    !prev || prev.moduleTo !== active.to || prev.tabLabel !== (activeTab?.label ?? null);
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
  // Главная — без вспышки (решение владельца).
  if (active.to === '/') return null;
  // Модуль без вкладок: от порта по шине, за стык и затухание на оси без точки.
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
