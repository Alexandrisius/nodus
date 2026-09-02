/** Иконка продукта Nodus: гексагональный узел с тремя балками (мастер docs/mvp/logo/Nodus_иконка.svg). */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth={3} fill="none" strokeLinecap="round">
        <line x1="32" y1="22.5" x2="32" y2="13" />
        <line x1="22.91" y1="38.25" x2="14.68" y2="43" />
        <line x1="41.09" y1="38.25" x2="49.32" y2="43" />
        <polygon points="32,26 38.06,29.5 38.06,36.5 32,40 25.94,36.5 25.94,29.5" />
      </g>
      <g fill="currentColor">
        <circle cx="32" cy="9.5" r="4.5" />
        <circle cx="11.65" cy="44.75" r="4.5" />
        <circle cx="52.35" cy="44.75" r="4.5" />
      </g>
    </svg>
  );
}

/** Знак «O»: гексагон с центрированным графом из полых узлов (мастер Nodus_знак_O.svg). */
export function LogoOMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g stroke="currentColor" fill="none" strokeLinecap="round">
        <polygon points="32,10 51.05,21 51.05,43 32,54 12.95,43 12.95,21" strokeWidth={4} />
        <g strokeWidth={2.5}>
          <line x1="32" y1="27.8" x2="32" y2="21" />
          <line x1="28.36" y1="34.1" x2="22.47" y2="37.5" />
          <line x1="35.64" y1="34.1" x2="41.53" y2="37.5" />
        </g>
        <circle cx="32" cy="32" r="3.2" strokeWidth={2.5} />
        <circle cx="32" cy="18" r="3" strokeWidth={2.5} />
        <circle cx="19.88" cy="39" r="3" strokeWidth={2.5} />
        <circle cx="44.12" cy="39" r="3" strokeWidth={2.5} />
      </g>
    </svg>
  );
}
