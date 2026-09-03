/** Глобальные SVG-фильтры «грубости от руки»: искажают рамки и линии шумом
 * Перлина (feTurbulence + feDisplacementMap). Применяются из CSS через
 * `filter: url(#rough-…)` — только к линиям/обводкам, текст остаётся чистым. */
export function SketchFilters() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter id="rough-sm">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="4"
            seed="7"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" />
        </filter>
        <filter id="rough-md">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02"
            numOctaves="4"
            seed="3"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" />
        </filter>
        <filter id="rough-lg">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves="4"
            seed="11"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" />
        </filter>
      </defs>
    </svg>
  );
}
