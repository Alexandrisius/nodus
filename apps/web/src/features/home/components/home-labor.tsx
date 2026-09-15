import type { LaborWeek } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeCard } from '@nodus/ui/components/node-card';

/** Трудозатраты по неделям: плоские столбики, моно-подписи (тема «Инструмент»). */
export function HomeLabor({ weeks }: { weeks: LaborWeek[] }) {
  const max = Math.max(...weeks.map((w) => w.hours), 1);
  const bw = 34;
  const gap = 16;
  const width = weeks.length * (bw + gap) + gap;
  const height = 130;

  return (
    <NodeCard label={ui.home.laborTitle}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={ui.home.laborTitle}
      >
        <line
          x1={gap / 2}
          y1={height - 18}
          x2={width - gap / 2}
          y2={height - 18}
          stroke="var(--edge)"
          strokeOpacity="0.5"
        />
        {weeks.map((week, i) => {
          const h = (week.hours / max) * (height - 40);
          const x = gap + i * (bw + gap);
          const y = height - 18 - h;
          return (
            <g key={week.label}>
              <rect
                x={x}
                y={y}
                width={bw}
                height={h}
                fill="var(--chart-1)"
                fillOpacity="0.85"
                rx="2"
              />
              <text
                x={x + bw / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--muted-foreground)"
              >
                {week.label}
              </text>
              <text
                x={x + bw / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--foreground)"
                fillOpacity="0.75"
              >
                {week.hours}
              </text>
            </g>
          );
        })}
      </svg>
    </NodeCard>
  );
}
