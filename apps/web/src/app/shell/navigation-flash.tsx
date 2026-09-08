import { useLayoutEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, type NodeEdgePoint } from '@nodus/ui/components/node-edge';

const FADE_MS = 2200;
/** Отступ ребра от шва рейки в контент. */
const SEAM_GAP = 20;

function centerOf(el: Element): NodeEdgePoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Навигационная вспышка (фишка №1 брифа): переключение модуля поджигает цепь —
 * от порта модуля в рейке ортогональное ребро со скруглёнными узлами идёт
 * через шов в контент, вверх и по оси топбара — к порту активной вкладки
 * (ЗАДАЧИ → МОЙ ПЛАН). Если у модуля нет вкладок — пульс от логотипа к порту
 * модуля по магистрали. Координаты измеряются из DOM по data-атрибутам
 * (не константами); ребро растворяется за 2.2с (связь = событие, не декор).
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
      if (!modulePort) return;
      const A = centerOf(modulePort);
      const tabPort = document.querySelector<HTMLElement>('[data-tab-port]');
      let points: NodeEdgePoint[];
      if (tabPort) {
        const B = centerOf(tabPort);
        const rail = document.querySelector<HTMLElement>('[data-rail]');
        const seamX = (rail?.getBoundingClientRect().right ?? A.x) + SEAM_GAP;
        points = [A, { x: seamX, y: A.y }, { x: seamX, y: B.y }, B];
      } else {
        const logo = document.querySelector<HTMLElement>('[data-logo-port]');
        const startY = logo ? logo.getBoundingClientRect().bottom - 4 : 0;
        points = [{ x: A.x, y: startY }, A];
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
      <NodeEdge points={route} drawOn pulse="once" />
    </div>
  );
}
