import { useLayoutEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

import { RAIL_TRUNK_X } from './node-rail.js';

const FADE_MS = 2200;

function centerOf(el: Element): NodeEdgePoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Навигационная вспышка (фишка №1 брифа): переключение модуля поджигает цепь —
 * от порта модуля по отводу в шину, вверх к логотипу-хабу и вправо по оси
 * топбара к активной вкладке (ЗАДАЧИ → МОЙ ПЛАН). Маршрут идёт ТОЛЬКО по
 * хрому (рейка + топбар), не пересекая контент. Если вкладок нет — цепь
 * заканчивается в логотипе-узле. Координаты — из DOM по data-атрибутам;
 * ребро растворяется за 2.2с (связь = событие, не декор).
 */
export function NavigationFlash() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const [route, setRoute] = useState<NodeEdgePoint[] | null>(null);

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const raf = requestAnimationFrame(() => {
      const modulePort = document.querySelector<HTMLElement>(
        '[data-module-port][data-active="true"]',
      );
      const logo = document.querySelector<HTMLElement>('[data-logo-port]');
      if (!modulePort || !logo) return;
      const A = centerOf(modulePort);
      const logoC = centerOf(logo);
      const railRight = document
        .querySelector<HTMLElement>('[data-rail]')
        ?.getBoundingClientRect().right;
      const seamX = railRight ?? RAIL_TRUNK_X;
      const trunk = { x: RAIL_TRUNK_X, y: A.y };
      const hub = { x: RAIL_TRUNK_X, y: logoC.y };
      const tab = document.querySelector<HTMLElement>('[data-tab-port][data-active="true"]');
      // Вкладки есть: отвод → шина → хаб → угол хрома → по оси топбара во вкладку.
      // Вкладок нет: отвод → шина → хаб → логотип-узел.
      let points: NodeEdgePoint[];
      if (tab) {
        const tabRect = tab.getBoundingClientRect();
        const tabY = tabRect.bottom; // ось бордюра топбара, на ней порты вкладок
        const tabX = tabRect.left + tabRect.width / 2;
        points = [
          A,
          trunk,
          hub,
          { x: seamX, y: logoC.y },
          { x: seamX, y: tabY },
          { x: tabX, y: tabY },
        ];
      } else {
        points = [A, trunk, hub, logoC];
      }
      setRoute(points);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, searchStr]);

  useLayoutEffect(() => {
    if (!route) return;
    const timer = window.setTimeout(() => setRoute(null), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [route]);

  if (!route) return null;
  return (
    <div className="dock-edge-fade pointer-events-none fixed inset-0 z-40" aria-hidden>
      <NodeEdge points={route} drawOn pulse="once" active />
    </div>
  );
}
