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

interface Body extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
  amp: number;
  birth: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

const COLORS: Record<NodeKind, string> = {
  person: '94,234,212',
  task: '129,140,248',
  project: '251,191,36',
  letter: '251,113,133',
  channel: '56,189,248',
  external: '148,163,184',
  satellite: '103,232,249',
};

const PLANET_ALT = '167,139,250';
const MAX_NODES = 420;
const SETTLE_TICKS = 240;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Живой граф компании: космос, где узлы-данные — звёзды, проекты — планеты.
 * Граф не замирает (дрейф, вращение, мерцание, рост); reduced-motion — статика. */
export function startGraph(canvas: HTMLCanvasElement, graph: CompanyGraph): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = mulberry32(1971);
  const bodies: Body[] = graph.nodes.map((n) => ({
    ...n,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    phase: rand() * Math.PI * 2,
    speed: 0.0002 + rand() * 0.0002,
    amp: 6 + rand() * 10,
    birth: 0,
  }));
  const edges: Array<[number, number]> = [...graph.edges];
  const pulses: Array<{ i: number; t0: number }> = [];
  const stars: Star[] = Array.from({ length: 150 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.4 + rand() * 0.9,
    phase: rand() * Math.PI * 2,
    speed: 0.0004 + rand() * 0.0006,
  }));

  let w = 0;
  let h = 0;
  let raf = 0;
  let settle = SETTLE_TICKS;
  let lastPulse = 0;
  let lastGrow = 0;
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const seedPositions = () => {
    for (const b of bodies) {
      const a = rand() * Math.PI * 2;
      const d = 40 + rand() * Math.min(w, h) * 0.45;
      b.x = w / 2 + Math.cos(a) * d * 1.5;
      b.y = h / 2 + Math.sin(a) * d * 0.8;
    }
  };

  const tick = (ambient: boolean) => {
    const k = ambient ? 0.25 : 1;
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (!a) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (!b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          d2 = 1;
        }
        if (d2 > 40000) continue;
        const f = (950 / d2) * k;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    }
    for (const [i, j] of edges) {
      const a = bodies[i];
      const b = bodies[j];
      if (!a || !b) continue;
      const rest = a.kind === 'satellite' || b.kind === 'satellite' ? 26 : 95;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = ((d - rest) / d) * 0.015 * k;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    for (const b of bodies) {
      b.vx += (w / 2 - b.x) * 0.0016 * k;
      b.vy += (h / 2 - b.y) * 0.0022 * k;
      b.vx *= 0.86;
      b.vy *= 0.86;
      b.x += b.vx;
      b.y += b.vy;
    }
  };

  const grow = (t: number) => {
    if (bodies.length >= MAX_NODES) return;
    const real = bodies.filter((b) => b.kind !== 'satellite');
    const parent = real[Math.floor(rand() * real.length)];
    if (!parent) return;
    const child: Body = {
      kind: 'satellite',
      r: 0.9 + rand() * 0.9,
      x: parent.x + (rand() - 0.5) * 30,
      y: parent.y + (rand() - 0.5) * 30,
      vx: 0,
      vy: 0,
      phase: rand() * Math.PI * 2,
      speed: 0.0002 + rand() * 0.0002,
      amp: 4 + rand() * 6,
      birth: t,
    };
    edges.push([bodies.indexOf(parent), bodies.length]);
    bodies.push(child);
    pulses.push({ i: bodies.length - 1, t0: t });
  };

  const render = (t: number) => {
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      ctx.fillStyle = `rgba(199,225,255,${(0.05 + tw * 0.16).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * w + px * 0.4, s.y * h + py * 0.4, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(w / 2 + px, h / 2 + py);
    ctx.rotate(t * 0.000004);
    ctx.translate(-w / 2, -h / 2);

    const pos = bodies.map((b) => ({
      x: b.x + Math.sin(t * b.speed + b.phase) * b.amp,
      y: b.y + Math.cos(t * b.speed * 0.9 + b.phase) * b.amp * 0.8,
    }));

    ctx.lineWidth = 1;
    for (const [i, j] of edges) {
      const a = pos[i];
      const b = pos[j];
      const na = bodies[i];
      const nb = bodies[j];
      if (!a || !b || !na || !nb) continue;
      const sat = na.kind === 'satellite' || nb.kind === 'satellite';
      ctx.strokeStyle = `rgba(125,211,252,${sat ? 0.04 : 0.08})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (let p = pulses.length - 1; p >= 0; p--) {
      const pulse = pulses[p];
      if (!pulse) continue;
      const age = t - pulse.t0;
      if (age > 1600) {
        pulses.splice(p, 1);
        continue;
      }
      const point = pos[pulse.i];
      const b = bodies[pulse.i];
      if (!point || !b) continue;
      const k = age / 1600;
      ctx.strokeStyle = `rgba(${COLORS[b.kind]},${(0.3 * (1 - k)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, b.r + k * 40, 0, Math.PI * 2);
      ctx.stroke();
    }

    bodies.forEach((b, i) => {
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
  };

  const frame = (t: number) => {
    if (settle > 0) {
      for (let k = 0; k < 4 && settle > 0; k++, settle--) tick(false);
    } else {
      tick(true);
    }

    px += (tx - px) * 0.02;
    py += (ty - py) * 0.02;

    if (t - lastPulse > 3000) {
      lastPulse = t;
      const real = bodies.filter((b) => b.kind !== 'satellite');
      const b = real[Math.floor(rand() * real.length)];
      if (b) pulses.push({ i: bodies.indexOf(b), t0: t });
    }
    if (t - lastGrow > 3500) {
      lastGrow = t;
      grow(t);
    }

    render(t);
    raf = requestAnimationFrame(frame);
  };

  resize();
  seedPositions();

  if (reduced) {
    for (let i = 0; i < SETTLE_TICKS; i++) tick(false);
    render(0);
  } else {
    raf = requestAnimationFrame(frame);
  }

  const onResize = () => {
    resize();
    if (reduced) render(0);
  };
  const onMove = (event: MouseEvent) => {
    tx = (event.clientX / Math.max(1, w) - 0.5) * 14;
    ty = (event.clientY / Math.max(1, h) - 0.5) * 10;
  };
  window.addEventListener('resize', onResize);
  if (!reduced) window.addEventListener('mousemove', onMove);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', onMove);
  };
}
