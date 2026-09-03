export type NodeKind =
  'person' | 'task' | 'project' | 'letter' | 'channel' | 'external' | 'satellite';

export interface GraphNode {
  kind: NodeKind;
  r: number;
}

export interface CompanyGraph {
  nodes: GraphNode[];
  edges: Array<[number, number]>;
}

export interface Body extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bx: number;
  by: number;
  phase: number;
  speed: number;
  amp: number;
  birth: number;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

export interface Pulse {
  i: number;
  t0: number;
}

export interface PaintState {
  bodies: Body[];
  edges: Array<[number, number]>;
  pulses: Pulse[];
  stars: Star[];
  w: number;
  h: number;
  frozen: boolean;
  px: number;
  py: number;
}

const COLORS: Record<NodeKind, string> = {
  person: '124,138,110',
  task: '91,127,157',
  project: '201,151,59',
  letter: '176,81,44',
  channel: '78,126,128',
  external: '154,166,149',
  satellite: '230,221,198',
};

const PLANET_ALT = '176,81,44';

/** Отрисовка кадра: мерцающие звёзды, созвездия-рёбра, планеты-проекты,
 * узлы-данные и пульсы событий; карта чуть смещается параллаксом и очень
 * медленно вращается. Чистая функция состояния — без физики. */
export function paint(ctx: CanvasRenderingContext2D, s: PaintState, t: number): void {
  const { w, h, px, py, frozen } = s;
  ctx.clearRect(0, 0, w, h);

  for (const star of s.stars) {
    const tw = 0.5 + 0.5 * Math.sin(t * star.speed + star.phase);
    ctx.fillStyle = `rgba(230,221,198,${(0.04 + tw * 0.12).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(star.x * w + px * 0.4, star.y * h + py * 0.4, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(w / 2 + px, h / 2 + py);
  ctx.rotate(t * 0.000004);
  ctx.translate(-w / 2, -h / 2);

  const pos = s.bodies.map((b) => {
    const baseX = frozen ? b.bx : b.x;
    const baseY = frozen ? b.by : b.y;
    return {
      x: baseX + Math.sin(t * b.speed + b.phase) * b.amp,
      y: baseY + Math.cos(t * b.speed * 0.9 + b.phase) * b.amp * 0.8,
    };
  });

  ctx.lineWidth = 1;
  for (const [i, j] of s.edges) {
    const a = pos[i];
    const b = pos[j];
    const na = s.bodies[i];
    const nb = s.bodies[j];
    if (!a || !b || !na || !nb) continue;
    const sat = na.kind === 'satellite' || nb.kind === 'satellite';
    ctx.strokeStyle = `rgba(230,221,198,${sat ? 0.04 : 0.08})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let p = s.pulses.length - 1; p >= 0; p--) {
    const pulse = s.pulses[p];
    if (!pulse) continue;
    const age = t - pulse.t0;
    if (age > 1600) {
      s.pulses.splice(p, 1);
      continue;
    }
    const point = pos[pulse.i];
    const b = s.bodies[pulse.i];
    if (!point || !b) continue;
    const k = age / 1600;
    ctx.strokeStyle = `rgba(${COLORS[b.kind]},${(0.3 * (1 - k)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, b.r + k * 40, 0, Math.PI * 2);
    ctx.stroke();
  }

  s.bodies.forEach((b, i) => {
    const point = pos[i];
    if (!point) return;
    const fade = b.birth === 0 ? 1 : Math.min(1, (t - b.birth) / 1500);
    const c = b.kind === 'project' && i % 2 === 1 ? PLANET_ALT : COLORS[b.kind];

    if (b.kind === 'project') {
      const g = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, b.r * 2.6);
      g.addColorStop(0, `rgba(${c},${(0.5 * fade).toFixed(3)})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(point.x, point.y, b.r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${c},${(0.75 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${c},${(0.14 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, b.r * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = `rgba(${c},${(0.05 * fade).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, b.r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${c},${((b.kind === 'satellite' ? 0.35 : 0.7) * fade).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}
