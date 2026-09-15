import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { NodeEdge, pathLength, snapPx, type NodeEdgePoint } from '@nodus/ui/components/node-edge';
import { cn } from '@nodus/ui/lib/utils';

import { parseCardStack } from './card-stack.js';
import {
  CIRCUIT_REMEASURE,
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

/** Отсрочка первого замера в режиме карточки: `slider-expand` (430 мс)
 *  трансформирует всю карточку вместе с хедером — rect'ы переходные;
 *  контур появляется одним кадром на осевшей геометрии. */
const CARD_SETTLE_MS = 480;

/**
 * Перманентный контур Nodus (реф node-based UI): единая связь слева направо —
 * стык (круглое сопряжение, без точки) → ось шапки до самого правого края
 * (контур ЗАМЕНЯЕТ бордюр и сливается с классической разметкой) — плюс шина
 * рейки с локтевыми отводами к портам модулей единым блоком и засечки вверх
 * к точкам вкладок (точка — у самого пункта, на оси точек нет). Вспышка —
 * один пульс к активному подменю, только на СМЕНУ фокуса: на сворачивание/
 * разворачивание панелей ЗАПРЕЩЕНА флагом width-transition (вердикт владельца
 * 14.09.2026: пульс на переходной геометрии улетал поверх рейки). Геометрия —
 * измерение DOM по data-атрибутам; пересчёт на resize, скролл навигатора и
 * покадрово во время transition ширины панелей.
 *
 * РЕЖИМ КАРТОЧКИ (план messenger-fullscreen): вершина стека — полноэкранная
 * карточка мессенджера → контур измеряется по её хедеру (`data-card-topbar`)
 * и рисуется ПОверх карточки (z-[60]); шина — урезанная, как у схлопнутой
 * рейки: узел-точка на левой границе карточки, ось до её правого края,
 * засечки к вкладкам карточки; первый замер — после оседания FLIP-раскрытия
 * (CARD_SETTLE_MS), перемер на смену вкладок — по событию CIRCUIT_REMEASURE.
 */
export function CircuitFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const menuCollapsed = useShellStore((s) => s.menuCollapsed);
  // Режим ПОЛНОЭКРАННОЙ карточки мессенджера (план messenger-fullscreen):
  // вершина стека — `messenger:<id>` → контур измеряется по хедеру карточки
  // и рисуется ПОверх неё (z-[60]); шина шелла под карточкой невидима.
  const cardMode = useMemo(() => {
    const stack = parseCardStack(new URLSearchParams(searchStr).get('cards'));
    return stack[stack.length - 1]?.kind === 'messenger';
  }, [searchStr]);
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  const [pulse, setPulse] = useState<{
    points: NodeEdgePoint[];
    dot: boolean;
    fadeMs: number;
  } | null>(null);
  const [pulseRun, setPulseRun] = useState(0);
  const prevFocus = useRef<CircuitFocus | null>(null);
  /** Ширина панелей в transition (свёртывание/развёртывание рейки, служебная
   *  полоса): вспышка в это время ЗАПРЕЩЕНА (вердикт владельца 14.09.2026:
   *  «вспышка вылетает непонятно куда, накладывается на левую панель») —
   *  измеряемый фокус на переходной геометрии мигает сигнатурой, и пульс
   *  рисовался на ломаных точках. Пока moving — фокус только запоминается. */
  const moving = useRef(false);
  /** Раскрытие фулскрин-карточки (FLIP-анимация): замеры глушатся до оседания
   *  (CARD_SETTLE_MS) — геометрия хедера в transform-переходе «плавает». */
  const settling = useRef(false);

  const pulseTimer = useRef(0);

  /** Одиночный пульс с авто-затуханием; длительность затухания — из длины
   * маршрута (рисовка + пробег + догорать), иначе дальний пульс обрывается. */
  const firePulse = useCallback((points: NodeEdgePoint[], dot: boolean) => {
    window.clearTimeout(pulseTimer.current);
    const len = pathLength(points);
    const fadeMs = (len / 1200 + len / 400 + 0.9) * 1000;
    setPulse({ points, dot, fadeMs });
    setPulseRun((k) => k + 1);
    pulseTimer.current = window.setTimeout(() => setPulse(null), fadeMs);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    let loop = 0;
    let settle = 0;
    const applyGeo = () => {
      if (settling.current) return;
      setGeo(measureCircuit(pathname, cardMode));
    };
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyGeo);
    };
    // Режим карточки включается: контур гаснет (шина шелла уходит под карточку)
    // и возвращается одним замером, когда FLIP-раскрытие осело.
    settling.current = cardMode;
    if (cardMode) {
      setGeo(null);
      settle = window.setTimeout(() => {
        settling.current = false;
        remeasure();
      }, CARD_SETTLE_MS);
    }
    // Плавный пересчёт КАЖДЫЙ КАДР во время transition ШИРИНЫ панелей —
    // контур идёт за панелью без ступенек. Фильтр propertyName: иначе цикл
    // гаснет по transitionend посторонних анимаций раньше окончания движения.
    const onTransitionRun = (e: TransitionEvent) => {
      if (e.propertyName !== 'width' || loop) return;
      moving.current = true;
      const tick = () => {
        applyGeo();
        loop = requestAnimationFrame(tick);
      };
      loop = requestAnimationFrame(tick);
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'width') return;
      cancelAnimationFrame(loop);
      loop = 0;
      moving.current = false;
      remeasure();
    };
    remeasure();
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.documentElement);
    document.addEventListener('transitionrun', onTransitionRun, true);
    document.addEventListener('transitionend', onTransitionEnd, true);
    document.addEventListener('transitioncancel', onTransitionEnd, true);
    document.addEventListener('scroll', remeasure, { capture: true, passive: true });
    // Вкладки фулскрин-карточки — локальное состояние (не маршрут): хром шлёт
    // CIRCUIT_REMEASURE после коммита data-active — перемер и вспышка фокуса.
    window.addEventListener(CIRCUIT_REMEASURE, remeasure);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(loop);
      window.clearTimeout(settle);
      ro.disconnect();
      document.removeEventListener('transitionrun', onTransitionRun, true);
      document.removeEventListener('transitionend', onTransitionEnd, true);
      document.removeEventListener('transitioncancel', onTransitionEnd, true);
      document.removeEventListener('scroll', remeasure, { capture: true });
      window.removeEventListener(CIRCUIT_REMEASURE, remeasure);
    };
  }, [pathname, searchStr, menuCollapsed, cardMode]);

  useLayoutEffect(() => {
    if (!geo) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Вспышка навигации — только на смену фокуса (не на движение панелей):
    // пока ширина панелей в transition, фокус лишь запоминается — пульс на
    // переходной геометрии улетал «непонятно куда» поверх рейки (вердикт
    // владельца 14.09.2026).
    const next = currentFocus(geo);
    if (moving.current) {
      prevFocus.current = next;
      return;
    }
    if (!reduced && focusSig(next) !== focusSig(prevFocus.current)) {
      const p = transitionPulse(geo, prevFocus.current);
      if (p) firePulse(p.points, p.dot);
    }
    prevFocus.current = next;
  }, [geo, firePulse]);

  if (!geo) return null;
  return (
    // Режим карточки: контур ПОверх фулскрин-карточки (z-50 слайдера), но под
    // оверлей-порталами (z-70+: меню, поповеры, лайтбокс) — лестница z канона.
    <div
      className={cn('pointer-events-none fixed inset-0', geo.cardMode ? 'z-[60]' : 'z-30')}
      aria-hidden
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        style={{ opacity: 0.32, willChange: 'opacity' }}
      >
        {/* Прозрачность — CSS-opacity ОТДЕЛЬНОГО svg-элемента + форсированный
            композитный слой (will-change): без слоя Chromium сворачивает
            opacity в alpha кисти и самопересечения подпутей (подходы отводов
            к шине, засечек к оси) композитятся дважды — «хвостики ярче шины»
            при зуме ≤ 100%. Со слоем буфер рисуется полным alpha, opacity —
            на композите (замерено: 130 → 82, ровно как чистая шина).
            Порты — в соседнем svg полным alpha. */}
        <path d={framePath(geo)} fill="none" stroke="var(--foreground)" strokeWidth="1" />
      </svg>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {/* Узел бокового шва схлопнутой рейки — точка 5px (r2 + stroke1) на
            оси в месте стыка: рисуется здесь, а не в DOM рейки, иначе
            overflow-hidden рейки срезает половину точки («сплющивает»).
            ТОЛЬКО при наличии вкладок (баг-вердикт 15.09.2026: на Главной со
            схлопнутой рейкой связи нет — точка-сирота и вспышка запрещены;
            на модулях с подмодулями узел и связи остаются). */}
        {geo.leftNode && geo.tabs.length > 0 ? (
          <circle
            cx={snapPx(geo.leftNode.x + 0.5)}
            cy={snapPx(geo.leftNode.y + 0.5)}
            r="2"
            // Режим карточки: узел сидит на границе карточки — тон карточки
            // (тон периметра/рейки читался бы чужой заплатой).
            fill={geo.cardMode ? 'var(--card)' : 'var(--sidebar)'}
            stroke="var(--edge)"
          />
        ) : null}
        {/* Терминальная точка модуля БЕЗ подмодулей (Главная развёрнутая):
            шина заканчивается узлом на линии шапки — плоского среза нет
            (вердикт 14.09.2026 вечером: ничего не торчит). */}
        {geo.terminus ? (
          <circle
            cx={snapPx(geo.terminus.x + 0.5)}
            cy={snapPx(geo.terminus.y + 0.5)}
            r="2"
            fill="var(--sidebar)"
            stroke="var(--edge)"
          />
        ) : null}
        {geo.tabs.map((t) => (
          <circle
            key={t.x}
            cx={snapPx(t.x)}
            cy={snapPx(geo.axisY - TICK)}
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
          className="dock-edge-fade absolute inset-0"
          style={{ animationDuration: `${pulse.fadeMs}ms` }}
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
