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
      <svg
        viewBox="0 0 64 64"
        className="size-[1.15em] shrink-0 -ml-[0.1em] -mr-[0.04em]"
        aria-hidden="true"
      >
        <polygon
          points="32,6 54.5,19 54.5,45 32,58 9.5,45 9.5,19"
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
