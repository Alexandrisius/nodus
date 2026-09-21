/**
 * Масштаб интерфейса (issue #60): единственный источник — CSS-переменная
 * `--ui-scale` на `:root` (packages/ui/src/styles/globals.css), множитель
 * корневого шрифта `html { font-size: calc(100% * var(--ui-scale)) }`.
 *
 * Все rem-утилиты Tailwind масштабируются корневым шрифтом автоматически;
 * этот модуль — для JS-геометрии, которая живёт в экранных px (ширины
 * панелей и минимумы лент, треки таблиц, координаты SVG-графов): дизайн-px
 * (база root 16px) умножаются на масштаб в точках потребления.
 *
 * Без округления намеренно: дизайн-константы выровнены по rem-сетке
 * (48 = 3rem, 42 = 2.625rem, 680 = 42.5rem…), поэтому точное произведение
 * совпадает с CSS-геометрией до субпикселя; округление дало бы накопление
 * дрейфа (шаг рядов рейки × N строк). Округляют потребители, которым нужен
 * целый px (drag-коммиты, snap).
 *
 * Чтение один раз на старте модуля безопасно: globals.css импортируется
 * первым стейтментом main.tsx (dev — style-модуль вычисляется раньше
 * поддерева App; prod — <link> в head до скриптов). Персональная настройка
 * масштаба (follow-up issue #60) пишет переменную на <html> до старта
 * приложения — чтение остаётся корректным; смена масштаба в рантайме
 * потребует перечитывания (перезагрузка страницы — приемлемо).
 * В средах без применённых стилей (SSR, node/jsdom-тесты: guard по
 * document + пустой computed style) действует FALLBACK_SCALE.
 */

/** Дизайн-база: дефолтный корневой шрифт браузера, px. */
const BASE_ROOT_PX = 16;

/** Фолбэк при недоступном CSS (SSR, jsdom без стилей) — дефолт globals.css. */
const FALLBACK_SCALE = 1.25;

function readUiScale(): number {
  // Computed font-size корня — ПЕРВЫЙ источник: он уже включает и --ui-scale,
  // и базу браузера пользователя (настройка шрифта, WCAG) — JS-геометрия
  // совпадает с CSS-rem при любой базе. Переменная — фолбэк сред без
  // применённых стилей (SSR, node/jsdom-тесты — там и она может отсутствовать).
  if (typeof document === 'undefined') return FALLBACK_SCALE;
  const styles = getComputedStyle(document.documentElement);
  const rootPx = Number.parseFloat(styles.fontSize);
  if (Number.isFinite(rootPx) && rootPx > 0) return rootPx / BASE_ROOT_PX;
  const fromVar = Number.parseFloat(styles.getPropertyValue('--ui-scale'));
  if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;
  return FALLBACK_SCALE;
}

/** Текущий множитель масштаба интерфейса (`--ui-scale`). */
export const UI_SCALE: number = readUiScale();

/** Дизайн-px (при root 16px) → экранные px текущего масштаба. */
export function uiPx(designPx: number): number {
  return designPx * UI_SCALE;
}
