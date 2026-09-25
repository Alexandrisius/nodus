import { Suspense, useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { Toaster } from '@nodus/ui/components/sonner';
import { TooltipProvider } from '@nodus/ui/components/tooltip';

import { registerCardBridge, registerReplaceTopMessenger } from '../../shared/lib/card-bridge.js';
import { stageMessengerThread } from '../../shared/chat/messenger-nav.js';
import { ChatDialogHosts } from '../../shared/chat/dialog-hosts.js';
import { useChatSocket } from '../../shared/socket/use-chat-socket.js';
import { CircuitFrame } from './circuit-frame.js';
import { CardStackHost } from './card-stack-host.js';
import { CommandPalette } from './command-palette.js';
import { EdgeScrollbar } from './edge-scrollbar.js';
import { LiveGraph } from './live-graph.js';
import { NodeRail } from './node-rail.js';
import { RightRail } from './right-rail.js';
import { useShellStore } from './shell-store.js';
import { TopBar } from './top-bar.js';
import { useCardStack, useOpenCard, useReplaceTopCard } from './use-card-stack.js';

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
  const openCard = useOpenCard();
  const cardStack = useCardStack();
  const replaceTopCard = useReplaceTopCard();
  // WS чата (#104): живёт с сессией, тихий статус; поллинг — fallback.
  useChatSocket();
  const stressMode =
    typeof window !== 'undefined' &&
    Number(new URLSearchParams(window.location.search).get('stress') ?? 0) >= 1000;

  // Мост shared→стек карточек (порт-адаптер, card-bridge.ts): shared-слой
  // открывает карточки, не импортируя каркас (направление слоёв, аудит #45).
  useEffect(
    () => registerCardBridge((ref) => openCard(ref as Parameters<typeof openCard>[0])),
    [openCard],
  );

  // Подмена верхней мессенджер-карточки (вердикт 25.09, п.4): переход к
  // беседе-приёмнику пересылки происходит ВНУТРИ открытого слайдера (замена
  // id без ремаунта, useReplaceTopCard); тред приёмника — через messenger-nav.
  useEffect(
    () =>
      registerReplaceTopMessenger(({ conversationId, threadRootId }) => {
        const top = cardStack[cardStack.length - 1];
        if (!top || top.kind !== 'messenger') return false;
        stageMessengerThread(conversationId, threadRootId);
        replaceTopCard({ kind: 'messenger', id: conversationId });
        return true;
      }),
    [cardStack, replaceTopCard],
  );

  useEffect(() => {
    const root = document.documentElement;
    // Дефолт — СВЕТЛАЯ (вердикт владельца 15.09.2026): она в :root без
    // атрибута; тёмная включается data-theme='dark' (до первой отрисовки
    // persisted-выбор ставит inline-скрипт index.html — без вспышки).
    if (theme === 'light') delete root.dataset.theme;
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
        <div className="relative flex min-w-0 flex-1">
          {/* Мягкая рама: топбар + рабочая зона ОДНОЙ мягкой панелью (18px,
              фон «лист»). Служебная полоса (профиль + коллеги) — ЗА пределами
              рамы, в правом периметре (план владельца 14.09.2026, R4): у рамы
              нет правого отступа, её правый край = левый край полосы; щель
              периметра 8px — справа от полосы (mr-2 полосы). Раскрытие полосы
              РЕФЛОУ: рама (flex-1) сужается влево синхронно с ростом ширины
              полосы; скроллбар страниц — у правого шва рамы. */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className="frame-shadow mt-2 mb-2 ml-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card"
              data-soft-frame
            >
              <TopBar />
              <div id="content" className="relative flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<ShellFallback />}>
                  <Outlet />
                </Suspense>
              </div>
            </div>
            {/* Стек карточек сущностей поверх раздела (ADR-0009, ?cards=) */}
            <CardStackHost />
          </div>
          <RightRail />
        </div>
      </div>
      <CircuitFrame />
      <EdgeScrollbar />
      <CommandPalette />
      <ChatDialogHosts />
      <Toaster richColors theme={theme} />
    </TooltipProvider>
  );
}
