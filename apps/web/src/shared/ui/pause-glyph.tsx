/** Пауза с целочисленной геометрией: lucide `Pause` на нецелом масштабе
 *  (size-4 при --ui-scale 1.25) рисует палочки разной видимой толщины
 *  из-за антиалиасинга дробных координат. `strokeWidth` — для совместимости
 *  с сигнатурой lucide-иконок в общих рендерерах кнопок. */
export function PauseGlyph({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.75" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.75" />
    </svg>
  );
}
