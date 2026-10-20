/**
 * Наконечники стрелок холста (#378 ред. 2): свои маркеры вместо встроенных
 * React Flow. Встроенный ArrowClosed красил заливку атрибутом `fill`, где
 * `var(--edge)` не работает (наконечник выходил «пустым»), и масштабировался
 * от толщины линии (`markerUnits=strokeWidth`) — у главной и выделенной
 * стрелки наконечник был больше. Здесь: размер в единицах холста (один для
 * всех линий), заливка — классом через токены обеих тем.
 */

export const ARROW_MARKER = 'nodus-flow-arrow';
export const ARROW_MARKER_SELECTED = 'nodus-flow-arrow-selected';

function Arrow({ id, className }: { id: string; className: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9.5"
      refY="5"
      markerWidth="10"
      markerHeight="10"
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      <path d="M 0.5 1 L 9.5 5 L 0.5 9 Z" className={className} />
    </marker>
  );
}

/** Определения маркеров — один раз на холст (невидимый svg). */
export function FlowMarkers() {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0 overflow-hidden">
      <defs>
        <Arrow id={ARROW_MARKER} className="flow-arrow" />
        <Arrow id={ARROW_MARKER_SELECTED} className="flow-arrow flow-arrow-selected" />
      </defs>
    </svg>
  );
}
