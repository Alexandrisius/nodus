import type { CompanyGraph, GraphNode, NodeKind } from '../lib/graph-engine.js';

import { demoConversations, demoMessages } from './data/chat.js';
import { demoLetters } from './data/letters.js';
import { demoProjects } from './data/projects.js';
import { demoTasks } from './data/task-items.js';
import { demoUserListItems } from './data/users.js';

/** Граф компании для живого фона: узлы — люди, проекты, задачи, письма,
 * каналы и внешние корреспонденты; рёбра — реальные связи демо-данных
 * плюс спутники-«данные» для плотности, как в референсах владельца. */
export function buildCompanyGraph(): CompanyGraph {
  const nodes: GraphNode[] = [];
  const edges: Array<[number, number]> = [];
  const idx = new Map<string, number>();

  const add = (key: string, kind: NodeKind, r: number): number => {
    const found = idx.get(key);
    if (found !== undefined) return found;
    idx.set(key, nodes.length);
    nodes.push({ kind, r });
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a >= 0 && b >= 0 && a !== b) edges.push([a, b]);
  };

  for (const u of demoUserListItems) add(`u:${u.id}`, 'person', 3);
  for (const p of demoProjects) {
    const pi = add(`p:${p.id}`, 'project', 4.6);
    if (p.manager) link(pi, add(`u:${p.manager.id}`, 'person', 3));
    for (const m of p.membersPreview) link(pi, add(`u:${m.id}`, 'person', 3));
  }
  for (const t of demoTasks) {
    const ti = add(`t:${t.id}`, 'task', 2.4);
    if (t.assignee) link(ti, add(`u:${t.assignee.id}`, 'person', 3));
    if (t.creator) link(ti, add(`u:${t.creator.id}`, 'person', 3));
    if (t.project) link(ti, add(`p:${t.project.id}`, 'project', 4.6));
    for (const p of t.participants) link(ti, add(`u:${p.id}`, 'person', 3));
  }
  for (const l of demoLetters) {
    const li = add(`l:${l.id}`, 'letter', 2.4);
    link(li, add(`e:${l.correspondent}`, 'external', 2.8));
    if (l.project) link(li, add(`p:${l.project.id}`, 'project', 4.6));
  }
  for (const c of demoConversations) {
    const ci = add(`c:${c.id}`, 'channel', 3.2);
    if (c.project) link(ci, add(`p:${c.project.id}`, 'project', 4.6));
    for (const m of c.membersPreview) link(ci, add(`u:${m.id}`, 'person', 3));
  }
  for (const m of demoMessages)
    link(add(`c:${m.conversationId}`, 'channel', 3.2), add(`u:${m.author.id}`, 'person', 3));

  const degree = new Array<number>(nodes.length).fill(0);
  for (const [a, b] of edges) {
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  }
  nodes.forEach((n, i) => {
    if (n.kind !== 'satellite') n.r += Math.min(2.2, (degree[i] ?? 0) * 0.22);
  });

  const realCount = nodes.length;
  for (let i = 0; i < realCount; i++) {
    const parent = nodes[i];
    if (!parent || parent.kind === 'external') continue;
    const sats = parent.kind === 'project' ? 4 : 3;
    for (let s = 0; s < sats; s++) {
      nodes.push({ kind: 'satellite', r: 0.9 + Math.random() * 0.9 });
      edges.push([i, nodes.length - 1]);
    }
  }

  // «Опытная компания»: департаменты-хабы с плотными кластерами данных,
  // детерминированно (mulberry32), чтобы фон был стабилен между рендерами.
  let a = 2026;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let d = 0; d < 14; d++) {
    const hub = add(`dep:${d}`, 'person', 3.4);
    link(hub, Math.floor(rnd() * realCount));
    const size = 25 + Math.floor(rnd() * 30);
    for (let i = 0; i < size; i++) {
      nodes.push({ kind: 'satellite', r: 0.8 + rnd() * 1.1 });
      const parent = rnd() < 0.8 ? hub : Math.max(0, nodes.length - 1 - Math.floor(rnd() * 3));
      edges.push([parent, nodes.length - 1]);
    }
  }

  return { nodes, edges };
}

/** Нагрузочный граф «опытная компания»: N узлов кластерами вокруг хабов,
 * координаты предвычислены (без физики) — для стресс-теста фона (?stress=N). */
export function buildStressGraph(count: number): CompanyGraph {
  let a = 77;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clamp = (v: number) => Math.min(0.99, Math.max(0.01, v));
  const nodes: GraphNode[] = [];
  const edges: Array<[number, number]> = [];
  const kinds: NodeKind[] = ['person', 'project', 'channel', 'letter'];
  const hubs = Math.max(10, Math.round(count / 300));
  const hubIdx: number[] = [];
  for (let i = 0; i < hubs; i++) {
    nodes.push({
      kind: kinds[i % kinds.length] ?? 'person',
      r: 2.5 + rnd() * 2,
      nx: 0.04 + rnd() * 0.92,
      ny: 0.06 + rnd() * 0.88,
    });
    hubIdx.push(nodes.length - 1);
    if (i > 0 && rnd() < 0.5) edges.push([i - 1, nodes.length - 1]);
  }
  while (nodes.length < count) {
    const hub = hubIdx[Math.floor(rnd() * hubIdx.length)] ?? 0;
    const hx = nodes[hub]?.nx ?? 0.5;
    const hy = nodes[hub]?.ny ?? 0.5;
    nodes.push({
      kind: 'satellite',
      r: 0.7 + rnd() * 1.2,
      nx: clamp(hx + (rnd() - 0.5) * 0.16),
      ny: clamp(hy + (rnd() - 0.5) * 0.22),
    });
    edges.push([hub, nodes.length - 1]);
  }
  return { nodes, edges };
}
