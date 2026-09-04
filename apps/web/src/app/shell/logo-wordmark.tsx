import { cn } from '@nodus/ui/lib/utils';

/** Словесный знак NODUS одним SVG: N, гексагон-«O», DUS. Зазоры и толщина
 * заданы вручную, независимо от метрик шрифта; буквы — Onest (жирный). */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 246 64"
      className={cn('h-[1.15em] w-auto shrink-0 select-none', className)}
      aria-hidden="true"
    >
      <text
        x="0"
        y="51"
        fontSize="54"
        fontWeight="700"
        fill="currentColor"
        fontFamily="Onest, system-ui, sans-serif"
      >
        N
      </text>
      <polygon
        points="30,13.5 46,22.75 46,41.25 30,50.5 14,41.25 14,22.75"
        transform="translate(42,0)"
        fill="none"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <text
        x="100"
        y="51"
        fontSize="54"
        fontWeight="700"
        letterSpacing="8"
        fill="currentColor"
        fontFamily="Onest, system-ui, sans-serif"
      >
        DUS
      </text>
    </svg>
  );
}
