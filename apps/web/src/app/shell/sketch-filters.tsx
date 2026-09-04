/** Глобальные SVG-фильтры «грубости от руки»: искажают рамки и линии шумом
 * Перлина (feTurbulence + feDisplacementMap). Применяются из CSS через
 * `filter: url(#rough-…)` — только к слоям с линиями/заливкой, текст чистый.
 * Частоты подобраны коротковолновыми: линия «дрожит», а не уходит в перекос. */
export function SketchFilters() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter id="rough-sm">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.09"
            numOctaves="4"
            seed="7"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" />
        </filter>
        <filter id="rough-md">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves="4"
            seed="3"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" />
        </filter>
        <filter id="rough-lg">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.025"
            numOctaves="3"
            seed="11"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" />
        </filter>
      </defs>
    </svg>
  );
}
