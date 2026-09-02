import { Suspense, useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Toaster } from '@nodus/ui/components/sonner';
import { TooltipProvider } from '@nodus/ui/components/tooltip';

import { CommandPalette } from './command-palette.js';
import { RightRail } from './right-rail.js';
import { SideMenu } from './side-menu.js';
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

/** Каркас приложения (§10.2): меню 240px · топбар · правая полоса 56px · слайдеры. */
export function AppShell() {
  const theme = useShellStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'airy') root.dataset.theme = 'airy';
    else delete root.dataset.theme;
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {ui.common.skipToContent}
      </a>
      <div className="flex h-screen overflow-hidden">
        <SideMenu />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div id="content" className="relative min-h-0 flex-1">
            <Suspense fallback={<ShellFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
        <RightRail />
      </div>
      <CommandPalette />
      <Toaster richColors />
    </TooltipProvider>
  );
}
