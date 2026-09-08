import { orthPath, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import { RAIL_TRUNK_X } from './node-rail.js';

/** Измеренная геометрия контура: порты из DOM по data-атрибутам. */
export interface CircuitGeometry {
  /** Нижняя точка логотипа (корень контура). */
  logoBottom: NodeEdgePoint;
  /** Стык шины рейки и оси шапки. */
  junction: NodeEdgePoint;
  /** Y оси бордюра шапки. */
  axisY: number;
  modules: { to: string; active: boolean; port: NodeEdgePoint }[];
  /** Центры вкладок топбара (x), активность. */
  tabs: { active: boolean; x: number }[];
  /** Узел правой панели (коллеги). */
  rightNode: NodeEdgePoint | null;
  /** Низ шины рейки (центр последнего модуля). */
  spineEndY: number;
}

function centerOf(el: Element): NodeEdgePoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Измерение контура из живого DOM. Возвращает null, если каркас не смонтирован. */
export function measureCircuit(): CircuitGeometry | null {
  const logo = document.querySelector<HTMLElement>('[data-logo-port]');
  const header = document.querySelector<HTMLElement>('[data-topbar]');
  if (!logo || !header) return null;
  const logoR = logo.getBoundingClientRect();
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
    logoBottom: { x: logoR.left + logoR.width / 2, y: logoR.bottom },
    junction: { x: RAIL_TRUNK_X, y: axisY },
    axisY,
    modules,
    tabs,
    rightNode: rightEl ? centerOf(rightEl) : null,
    spineEndY: modules.length ? Math.max(...modules.map((m) => m.port.y)) : axisY,
  };
}

/** Статичный контур одним путём: артерия лого→стык→шина рейки с локтевыми
 * отводами к портам + ось шапки → правый узел + засечки-ответвления на вкладки. */
export function framePath(g: CircuitGeometry): string {
  const parts: string[] = [];
  parts.push(
    orthPath(
      [{ x: g.logoBottom.x, y: g.logoBottom.y + 2 }, { x: g.logoBottom.x, y: g.axisY }, g.junction],
      8,
    ),
  );
  if (g.modules.length > 0) {
    parts.push(orthPath([g.junction, { x: g.junction.x, y: g.spineEndY }], 8));
    for (const m of g.modules) {
      parts.push(
        orthPath(
          [
            { x: g.junction.x, y: m.port.y - 10 },
            { x: g.junction.x, y: m.port.y },
            { x: m.port.x - 5, y: m.port.y },
          ],
          8,
        ),
      );
    }
  }
  const rightEnd = g.rightNode?.x ?? g.junction.x + 200;
  parts.push(orthPath([g.junction, { x: rightEnd, y: g.axisY }], 8));
  if (g.rightNode) {
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
    parts.push(`M${t.x},${g.axisY} V${g.axisY + 6}`);
  }
  return parts.filter(Boolean).join(' ');
}

/** Отвод к активному модулю — подсвечивается отдельным слоем. */
export function activeBranchPath(g: CircuitGeometry): string | null {
  const m = g.modules.find((item) => item.active);
  if (!m) return null;
  return orthPath(
    [
      { x: g.junction.x, y: m.port.y - 10 },
      { x: g.junction.x, y: m.port.y },
      { x: m.port.x - 5, y: m.port.y },
    ],
    8,
  );
}

/** Вспышки навигации: от логотипа по артерии к порту активного модуля и,
 * если есть вкладки, от стыка по оси шапки к активной вкладке. Концы —
 * строго в портах, никаких висящих точек. */
export function pulsePaths(g: CircuitGeometry): NodeEdgePoint[][] {
  const active = g.modules.find((m) => m.active);
  if (!active) return [];
  const paths: NodeEdgePoint[][] = [
    [
      { x: g.logoBottom.x, y: g.logoBottom.y + 2 },
      { x: g.logoBottom.x, y: g.axisY },
      { x: g.junction.x, y: g.axisY },
      { x: g.junction.x, y: active.port.y },
      active.port,
    ],
  ];
  const activeTab = g.tabs.find((t) => t.active);
  if (activeTab) {
    paths.push([g.junction, { x: activeTab.x, y: g.axisY }]);
  }
  return paths;
}
