import { useEffect, useRef } from 'react';

/** Сколько держать гвард после события транзиции без новых событий: длиннейшая
 *  width-анимация каркаса — рейка 300 мс; если события потерялись, гвард не
 *  должен залипнуть навсегда (вспышка бы перестала вылетать вовсе). */
const WATCHDOG_MS = 400;

/**
 * Движение геометрии каркаса (transition ШИРИНЫ контейнеров — левая рейка,
 * правая служебная полоса): пока ширины едут, замеры контура переходные, и
 * вспышка на смену фокуса обязана ждать оседания.
 *
 * Почему не по одиночной `transitionend` (баг 14.10.2026): ширина МОЖЕТ ехать
 * двумя транзициями сразу (переход на/с мессенджера прячет правую полосу, а
 * рейка при этом раскрывается — событий два, каждый со своим transitionend), и
 * завершение ЛЮБОЙ из них снимало гвард, пока вторая ещё ехала. Хуже: `run` +
 * `end` одной транзиции снимали гвард ВНУТРИ окна другой (быстрый клик по
 * модулям) — вспышка стреляла по переходной геометрии, а `end` на осевшей
 * геометрии записывал фокус без пульса.
 *
 * Учёт по элементам (Map: элемент → счётчик активных width-транзиций):
 * гвард снимается, когда набор опустел, и через КАДР (settle-кадр — уже
 * осевшая геометрия). `onSettle` вызывается ровно один раз на серию.
 * `onRun` — серия началась/продолжается (в circuit-frame: дорисовать
 * отложенную вспышку предыдущего фокуса, она уже не дождётся settle-кадра);
 * `onFrames(true/false)` — включение/выключение покадрового пересчёта.
 */
export function useGeometryMotion({
  onRun,
  onSettle,
  onFrames,
}: {
  /** Новый переход ширины начался. `active` — движение уже идёт (кадровый
   *  цикл запущен предыдущей транзицией серии). `pendingSettle` — у ПРЕДЫДУЩЕГО
   *  движения был запланирован, но не выполнен кадр оседания (сейчас он будет
   *  отменён): смена фокуса ещё не нарисована — вызывающий дорисовывает сам. */
  onRun: (info: { active: boolean; pendingSettle: boolean }) => void;
  onSettle: () => void;
  onFrames: (active: boolean) => void;
}) {
  const running = useRef(new Map<EventTarget, number>());
  const settleRaf = useRef(0);
  const watchdog = useRef(0);
  /** Кадровый цикл запущен (onFrames(true) без парного false). */
  const framesOn = useRef(false);
  // Живые колбэки: слушатели ставятся один раз (эффект ниже) — рендер-скоуп
  // им не виден, а рендеры между транзициями случаются.
  const cb = useRef({ onRun, onSettle, onFrames });
  cb.current = { onRun, onSettle, onFrames };

  useEffect(() => {
    const settle = () => {
      window.clearTimeout(watchdog.current);
      watchdog.current = 0;
      settleRaf.current = 0;
      if (framesOn.current) {
        framesOn.current = false;
        cb.current.onFrames(false);
      }
      cb.current.onSettle();
    };
    const ensureWatchdog = () => {
      window.clearTimeout(watchdog.current);
      watchdog.current = window.setTimeout(settle, WATCHDOG_MS);
    };
    const onRun = (e: Event) => {
      const ev = e as TransitionEvent;
      if (ev.propertyName !== 'width') return;
      const key = ev.target as EventTarget;
      running.current.set(key, (running.current.get(key) ?? 0) + 1);
      ensureWatchdog();
      const pendingSettle = settleRaf.current !== 0;
      if (pendingSettle) {
        // Кадр оседания отменяется следующим движением — снимаем сразу, чтобы
        // вызывающий не запускал кадровый цикл повторно.
        cancelAnimationFrame(settleRaf.current);
        settleRaf.current = 0;
      }
      cb.current.onRun({ active: framesOn.current, pendingSettle });
      if (!framesOn.current) {
        framesOn.current = true;
        cb.current.onFrames(true);
      }
    };
    const onEnd = (e: Event) => {
      const ev = e as TransitionEvent;
      if (ev.propertyName !== 'width') return;
      const key = ev.target as EventTarget;
      const runs = (running.current.get(key) ?? 0) - 1;
      if (runs > 0) running.current.set(key, runs);
      else running.current.delete(key);
      ensureWatchdog();
      if (running.current.size > 0) return;
      // Последняя транзиция серии: кадр на осевшую геометрию (в текущем кадре
      // ещё видны финальные промежуточные значения геометрии).
      cancelAnimationFrame(settleRaf.current);
      settleRaf.current = requestAnimationFrame(settle);
    };
    document.addEventListener('transitionrun', onRun, true);
    document.addEventListener('transitionend', onEnd, true);
    document.addEventListener('transitioncancel', onEnd, true);
    return () => {
      document.removeEventListener('transitionrun', onRun, true);
      document.removeEventListener('transitionend', onEnd, true);
      document.removeEventListener('transitioncancel', onEnd, true);
      cancelAnimationFrame(settleRaf.current);
      settleRaf.current = 0;
      window.clearTimeout(watchdog.current);
      watchdog.current = 0;
      // Осиротевшие транзиции прежнего жизненного цикла: слушателей больше
      // нет — их события (в т.ч. cancel при размонтировании) не придут.
      // (Ref к Map создаётся раз и не переприсваивается — чистить безопасно.)
      running.current.clear(); // eslint-disable-line react-hooks/exhaustive-deps
      if (framesOn.current) {
        framesOn.current = false;
        cb.current.onFrames(false);
      }
    };
  }, []);
}
