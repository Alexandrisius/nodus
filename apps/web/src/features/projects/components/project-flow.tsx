import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';

import { stageTone } from '../../../shared/ui/board/stage-tone.js';
import { useProjectTaskPages } from '../api/projects-api.js';

/** Геометрия узла схемы (px): карточка w-44 (176) × ~64. */
const NODE_W = 176;
const NODE_H = 64;

interface FlowNode {
  id: string;
  label: string;
  color: keyof typeof stageTone;
  x: number;
  y: number;
}

/** Узлы — стадии workflow проекта (имена — из i18n колонок канбана). */
const flowNodes: FlowNode[] = [
  { id: 'new', label: ui.tasks.colNew, color: 'neutral', x: 0, y: 140 },
  { id: 'work', label: ui.tasks.colInProgress, color: 'info', x: 220, y: 140 },
  { id: 'review', label: ui.tasks.colOnControl, color: 'warning', x: 440, y: 140 },
  { id: 'done', label: ui.tasks.colDone, color: 'success', x: 660, y: 140 },
  { id: 'paused', label: ui.tasks.colPostponed, color: 'neutral', x: 220, y: 310 },
];

const midY = (n: FlowNode) => n.y + NODE_H / 2;
const bottomY = (n: FlowNode) => n.y + NODE_H;

/** Ребро: ломаная точками (локти скругляются Q-кривыми в render), подпись —
 *  HTML-спан по центру заданной точки. Порт-точка у источника, стрелка у цели. */
interface FlowEdge {
  id: string;
  points: [number, number][];
  label: string;
  labelAt: [number, number];
}

const node = (id: string): FlowNode => {
  const found = flowNodes.find((n) => n.id === id);
  // Реестр статичен: отсутствие узла — ошибка программиста, не данных.
  if (!found) throw new Error(`Unknown flow node: ${id}`);
  return found;
};

const flowEdges: FlowEdge[] = (() => {
  const [nNew, nWork, nReview, nDone, nPaused] = [
    node('new'),
    node('work'),
    node('review'),
    node('done'),
    node('paused'),
  ];
  return [
    {
      id: 'take',
      points: [
        [nNew.x + NODE_W, midY(nNew)],
        [nWork.x, midY(nWork)],
      ],
      label: ui.projects.flow.takeToWork,
      labelAt: [(nNew.x + NODE_W + nWork.x) / 2, midY(nNew) - 12],
    },
    {
      id: 'review',
      points: [
        [nWork.x + NODE_W, midY(nWork)],
        [nReview.x, midY(nReview)],
      ],
      label: ui.projects.flow.toReview,
      labelAt: [(nWork.x + NODE_W + nReview.x) / 2, midY(nWork) - 12],
    },
    {
      id: 'approve',
      points: [
        [nReview.x + NODE_W, midY(nReview)],
        [nDone.x, midY(nDone)],
      ],
      label: ui.projects.flow.approve,
      labelAt: [(nReview.x + NODE_W + nDone.x) / 2, midY(nReview) - 12],
    },
    {
      id: 'return',
      points: [
        [nReview.x + 88, bottomY(nReview)],
        [nReview.x + 88, 262],
        [nWork.x + 170, 262],
        [nWork.x + 170, bottomY(nWork)],
      ],
      label: ui.projects.flow.returnBack,
      labelAt: [nReview.x + 88 - 70, 262],
    },
    {
      id: 'postpone',
      points: [
        [nWork.x + 70, bottomY(nWork)],
        [nPaused.x + 70, nPaused.y],
      ],
      label: ui.projects.flow.postpone,
      labelAt: [nWork.x + 78, 250],
    },
    {
      id: 'resume',
      points: [
        [nPaused.x + 130, nPaused.y],
        [nWork.x + 130, bottomY(nWork)],
      ],
      label: ui.projects.flow.resume,
      labelAt: [nWork.x + 138, 250],
    },
  ];
})();

/** Ломаная с локтями r=8 (канон связей): сегменты H/V, углы — Q-кривые. */
function edgePath(points: [number, number][]): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    if (!prev || !corner || !next) continue;
    const r = 8;
    const inX = corner[0] - Math.sign(corner[0] - prev[0]) * r;
    const inY = corner[1] - Math.sign(corner[1] - prev[1]) * r;
    const outX = corner[0] + Math.sign(next[0] - corner[0]) * r;
    const outY = corner[1] + Math.sign(next[1] - corner[1]) * r;
    d += ` L ${inX} ${inY} Q ${corner[0]} ${corner[1]} ${outX} ${outY}`;
  }
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

const automationRules = [
  ui.projects.flow.automationReview,
  ui.projects.flow.automationDone,
  ui.projects.flow.automationOverdue,
];

/**
 * Вкладка «Схема» карточки проекта — ВИТРИНА будущего редактора workflow
 * (вердикт владельца 2026-09-11, раунд 3: показать автоматизацию движения
 * задач по схеме): узлы-стадии со счётчиками РЕАЛЬНЫХ задач проекта,
 * переходы с подписями действий, блок «Автоматика схемы» (правила-триггеры).
 * Редактор схем и исполнение автоматики — после MVP (#38, вердикт
 * владельца: автоматизация — через редактор схем).
 */
export function ProjectFlow({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectTaskPages(projectId);

  const counts = useMemo(() => {
    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const by = (predicate: (state: string, name: string) => boolean) =>
      items.filter((t) => predicate(t.stage.systemState, t.stage.name)).length;
    return {
      new: by((s) => s === 'backlog'),
      work: by((s, name) => s === 'active' && name !== ui.tasks.colOnControl),
      review: by((_s, name) => name === ui.tasks.colOnControl),
      done: by((s) => s === 'done' || s === 'closed'),
      paused: by((s) => s === 'paused'),
    } as Record<string, number>;
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-[420px] w-full max-w-4xl" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-5">
      <div className="relative" style={{ width: 836, height: 390 }}>
        {/* Рёбра — SVG-подложка: порты у источников, стрелки у целей. */}
        <svg aria-hidden className="absolute inset-0" width={836} height={390}>
          <defs>
            <marker
              id="project-flow-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 Z" className="fill-port" />
            </marker>
          </defs>
          {flowEdges.map((edge) => {
            const [sx, sy] = edge.points[0] ?? [0, 0];
            return (
              <g key={edge.id}>
                <path
                  d={edgePath(edge.points)}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-edge"
                  markerEnd="url(#project-flow-arrow)"
                />
                <circle cx={sx} cy={sy} r={3} className="fill-port" />
              </g>
            );
          })}
        </svg>

        {flowEdges.map((edge) => (
          <span
            key={`${edge.id}-label`}
            className="absolute -translate-x-1/2 -translate-y-1/2 bg-background px-1 font-mono text-[9px] tracking-[0.1em] whitespace-nowrap text-muted-foreground uppercase"
            style={{ left: edge.labelAt[0], top: edge.labelAt[1] }}
          >
            {edge.label}
          </span>
        ))}

        {flowNodes.map((n) => (
          <div key={n.id} className="node-panel absolute w-44 p-3" style={{ left: n.x, top: n.y }}>
            <div className="flex items-center gap-2">
              <span aria-hidden className={cn('size-2 rounded-full', stageTone[n.color].dot)} />
              <span className="truncate text-sm font-medium">{n.label}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                {counts[n.id] ?? 0}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Автоматика схемы — правила-триггеры (витрина; исполнение — #38). */}
      <div className="mt-6 max-w-2xl">
        <NodeLabel label={ui.projects.flow.automation} />
        <div className="mt-2.5 flex flex-col gap-1.5">
          {automationRules.map((rule) => (
            <div
              key={rule}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm"
            >
              <Zap className="size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">{rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
