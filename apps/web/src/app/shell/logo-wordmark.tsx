import { LogoOMark } from './logo-icon.js';

/**
 * Словесный знак NODUS, где O — гексагон с графом из полых узлов
 * (мастер docs/mvp/logo/Nodus_словесный_знак.svg; шрифт — Onest, кандидат айдентики).
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`flex items-center font-bold tracking-[0.05em] whitespace-nowrap select-none ${className ?? ''}`}
    >
      N
      <LogoOMark className="mx-0.5 size-[1.3em] shrink-0" />
      DUS
    </span>
  );
}
