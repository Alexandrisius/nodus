/** Гексагон — глиф отправки (вердикт 24.09, раунд 5: «просто шестиугольник
 *  покрупнее, красивый как отдельная кнопка»: БЕЗ спиц и узлов прежнего
 *  знака Nodus — они читались «мини-графом»). Правильный шестиугольник
 *  pointy-top во весь viewBox, штрих как у соседних иконок композера. */
export function SendHexIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polygon points="12,2.8 20,7.4 20,16.6 12,21.2 4,16.6 4,7.4" />
    </svg>
  );
}
