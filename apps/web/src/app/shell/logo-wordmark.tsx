/**
 * Словесный знак NODUS, где O — гексагон без внутреннего графа
 * (решение владельца 03.09.2026: граф живёт в значке слева от названия).
 * Мастер айдентики — docs/mvp/logo/Nodus_словесный_знак.svg; шрифт — Onest.
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`flex items-center font-bold tracking-[0.05em] whitespace-nowrap select-none ${className ?? ''}`}
    >
      N
      <svg viewBox="0 0 64 64" className="size-[1.15em] shrink-0 -mx-[0.02em]" aria-hidden="true">
        <polygon
          points="32,4 57,18 57,46 32,60 7,46 7,18"
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinejoin="round"
        />
      </svg>
      DUS
    </span>
  );
}
