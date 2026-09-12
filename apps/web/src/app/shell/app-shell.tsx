import { Suspense, useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Toaster } from '@nodus/ui/components/sonner';
import { TooltipProvider } from '@nodus/ui/components/tooltip';

import { CircuitFrame } from './circuit-frame.js';
import { CardStackHost } from './card-stack-host.js';
import { CommandPalette } from './command-palette.js';
import { LiveGraph } from './live-graph.js';
import { NodeRail } from './node-rail.js';
import { RightRail } from './right-rail.js';
import { useShellStore } from './shell-store.js';
import { TopBar } from './top-bar.js';

function ShellFallback() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="w-full flex-1" />
    </div>
  );
}

/** Каркас приложения (§10.2) в теме «Инструмент»: рейка-магистраль 240px ·
 * топбар · правая полоса 56px · слайдеры. Фон — плоский (реф node-based UI);
 * легаси-граф монтируется только в нагрузочном режиме `?stress=N` (harness
 * для будущей итерации живого фона, тест graph-stress). */
export function AppShell() {
  const theme = useShellStore((s) => s.theme);
  const stressMode =
    typeof window !== 'undefined' &&
    Number(new URLSearchParams(window.location.search).get('stress') ?? 0) >= 1000;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        useShellStore.getState().setCommandOpen(!useShellStore.getState().commandOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {ui.common.skipToContent}
      </a>
      <div className="flex h-screen overflow-hidden bg-background">
        {stressMode ? <LiveGraph /> : null}
        <NodeRail />
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Мягкая рама: топбар + рабочая зона ОДНОЙ мягкой панелью (18px,
              отступы 8px, фон «лист») — ступень формы поверх ступеней тона,
              как в рефах команды (пакет мягкости, вердикт владельца
              12.09.2026). Справа остаётся карман 40px — статичная служебная
              колонка: угол профиля над полосой коллег; скроллбар страниц —
              у правого края рамы, в 8px от полосы (dwell не конкурирует). */}
          <div
            className="m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card"
            data-soft-frame
          >
            <TopBar />
            <div className="relative flex min-h-0 flex-1">
              <div id="content" className="relative flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<ShellFallback />}>
                  <Outlet />
                </Suspense>
              </div>
              {/* Полоса коллег — ВНУТРИ рамы под осью контура (вердикт
                  12.09.2026): мягкая зона до края экрана с зазором 8px. */}
              <RightRail />
            </div>
          </div>
          {/* Стек карточек сущностей поверх раздела (ADR-0009, ?cards=) */}
          <CardStackHost />
        </div>
      </div>
      <CircuitFrame />
      <CommandPalette />
      <Toaster richColors theme={theme} />
    </TooltipProvider>
  );
}
