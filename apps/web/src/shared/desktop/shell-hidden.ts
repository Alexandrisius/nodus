/**
 * Реестр «оболочка скрылась» (#254, фидбек 08.10): сокрытие десктоп-оболочки
 * в трей не меняет `document.hidden` в WebView2 — `visibilitychange` не
 * стреляет, и хвост квитанций просмотра чата оставался неотправленным.
 * Оболочка сигналит shell-visibility, `desktop-bridge` зовёт
 * `flushOnShellHidden()` — каждый живой планировщик дозаписывает увиденное.
 *
 * Отдельный модуль без зависимостей (#358): раньше bridge тянул
 * планировщик ленивым `import()` — fire-and-forget импорт доезжал после
 * teardown тестового окружения и валил CI (EnvironmentTeardownError).
 *
 * Множество, не одна ячейка: беседа и тред живут одновременно, а снятие
 * регистрации сравнивает ту же функцию.
 */
const flushOnHide = new Set<() => void>();

/** Регистрация колбэка «оболочка скрылась»; возвращает снятие регистрации. */
export function registerShellHiddenFlush(fn: () => void): () => void {
  flushOnHide.add(fn);
  return () => {
    flushOnHide.delete(fn);
  };
}

/** Вызов из desktop-bridge при visible=false. */
export function flushOnShellHidden(): void {
  for (const fn of flushOnHide) fn();
}
