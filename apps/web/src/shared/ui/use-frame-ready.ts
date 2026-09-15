import { useEffect, useState } from 'react';

/**
 * true ПОСЛЕ двух кадров с монтирования компонента.
 *
 * Назначение — плавное ПЕРВОЕ открытие transition-панелей (баг-вердикт
 * владельца 15.09.2026: панель «О чате» после обновления страницы в первый
 * раз появляется РЫВКОМ): панель монтируется в момент открытия, а свежий
 * элемент рождается сразу в целевом состоянии — CSS transition идти неоткуда.
 * Решение (приём SliderPanel, double rAF): монтировать в закрытом состоянии
 * и ставить класс раскрытия ПОСЛЕ двух кадров — к моменту смены класса
 * элемент уже отрисован, transition стартует с первого кадра.
 * Потребитель — `shared/chat/chat-side-panel.tsx` (и любая панель с
 * паттерном «монтируется при первом открытии»).
 */
export function useFrameReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  return ready;
}
