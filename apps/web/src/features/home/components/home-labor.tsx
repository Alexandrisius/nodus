import { ChartNoAxesColumn } from 'lucide-react';
import type { LaborWeek } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

/** Карандашный столбиковый график трудозатрат: лёгкий «поводырь» линий. */
export function HomeLabor({ weeks }: { weeks: LaborWeek[] }) {
  const max = Math.max(...weeks.map((w) => w.hours), 1);
  const bw = 34;
  const gap = 16;
  const width = weeks.length * (bw + gap) + gap;
  const height = 130;

  return (
    <section className="paper-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-ochre/20 text-ochre">
          <ChartNoAxesColumn className="size-4" />
        </span>
        {ui.home.laborTitle}
      </h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full"
        role="img"
        aria-label={ui.home.laborTitle}
      >
        <line
          x1={gap / 2}
          y1={height - 18}
          x2={width - gap / 2}
          y2={height - 18}
          stroke="var(--pencil)"
          strokeOpacity="0.45"
          strokeDasharray="5 4"
        />
        {weeks.map((week, i) => {
          const h = (week.hours / max) * (height - 40);
          const x = gap + i * (bw + gap);
          const y = height - 18 - h;
          const tilt = i % 2 === 0 ? -0.6 : 0.5;
          return (
            <g key={week.label} transform={`rotate(${tilt} ${x + bw / 2} ${y + h})`}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={h}
                fill="var(--ochre)"
                fillOpacity="0.35"
                stroke="var(--pencil)"
                strokeOpacity="0.6"
                rx="2"
              />
              <text
                x={x + bw / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--pencil)"
                fillOpacity="0.6"
              >
                {week.label}
              </text>
              <text
                x={x + bw / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize="9"
                fill="var(--pencil)"
                fillOpacity="0.8"
              >
                {week.hours}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
