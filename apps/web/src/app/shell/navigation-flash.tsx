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
 * от порта модуля по отводу в шину, вверх по шине до верха навигатора и вправо
 * по оси бордюра шапки (свободная хром-ось рейка→вкладки) — точно в порт
 * активной вкладки (ЗАДАЧИ → МОЙ ПЛАН). Не пересекает ни контент, ни логотип.
 * Если вкладок нет — цепь заканчивается у верха шины, под логотипом.
 * Координаты — из DOM по data-атрибутам; ребро растворяется за 2.2с
 * (связь = событие, не декор).
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
      const branch = { x: RAIL_TRUNK_X, y: A.y };
      const tab = document.querySelector<HTMLElement>('[data-tab-port][data-active="true"]');
      let points: NodeEdgePoint[];
      if (tab) {
        const tabRect = tab.getBoundingClientRect();
        const axisY = tabRect.bottom; // ось бордюра шапки: от верха шины до порта вкладки
        const tabX = tabRect.left + tabRect.width / 2;
        points = [A, branch, { x: RAIL_TRUNK_X, y: axisY }, { x: tabX, y: axisY }];
      } else {
        points = [A, branch, { x: RAIL_TRUNK_X, y: logo.getBoundingClientRect().bottom + 3 }];
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
