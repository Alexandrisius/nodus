import { useEffect, useState } from 'react';

/** Значение с задержкой (ввод в поиск → запрос): сервер не дёргается на
 *  каждую букву. Первое значение отдаётся сразу — задержка только на
 *  изменениях после монтирования. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (Object.is(value, debounced)) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
    // debounced в зависимостях: после срабатывания таймера эффект не
    // перезапускается на то же значение (иначе таймер живёт вечно).
  }, [value, delayMs, debounced]);

  return debounced;
}
