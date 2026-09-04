import { useEffect, useRef } from 'react';

import { startGraph } from '../../shared/lib/graph-engine.js';
import { buildCompanyGraph, buildStressGraph } from '../../shared/mocks/company-graph.js';

/** Живой граф компании на заднем фоне: грифельная доска с созвездиями.
 * `?stress=N` — нагрузочный режим: предразмещённый граф на N узлов. */
export function LiveGraph() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stress = Number(new URLSearchParams(window.location.search).get('stress') ?? 0);
    const graph =
      stress >= 1000 ? buildStressGraph(Math.min(stress, 300_000)) : buildCompanyGraph();
    return startGraph(canvas, graph);
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[#0c1712]">
      <div className="absolute inset-0 bg-[radial-gradient(1100px_700px_at_72%_18%,#163024_0%,transparent_60%),radial-gradient(900px_600px_at_18%_82%,#12261c_0%,transparent_55%)]" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(12,23,18,0.6)_0%,rgba(12,23,18,0.25)_40%,rgba(12,23,18,0.05)_100%)]" />
    </div>
  );
}
