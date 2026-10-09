import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DESKTOP_BRIDGE_EVENTS,
  shellUpdateStateSchema,
  type ShellUpdateState,
} from '@nodus/contracts';

import { getShellUpdateState, isDesktopShell, onDesktopEvent } from './desktop-bridge.js';
import { fetchDesktopManifest, type DesktopManifest } from './desktop-manifest.js';

export const desktopAppKeys = {
  manifest: ['desktop', 'manifest'] as const,
};

const IDLE_STATE: ShellUpdateState = { status: 'idle', version: null };

/**
 * Кнопка «Скачать приложение» (#263): манифест раздачи `/desktop/latest.json`
 * (браузер и оболочка), в оболочке — ещё и состояние автообновления мостом
 * (событие update-state + первичный опрос). Нет манифеста — кнопки нет.
 */
export function useDesktopApp(): {
  manifest: DesktopManifest | null;
  inShell: boolean;
  updateState: ShellUpdateState;
} {
  const manifest = useQuery({
    queryKey: desktopAppKeys.manifest,
    queryFn: fetchDesktopManifest,
    // Манифест живёт редко и не горит: без ретраев и фоновых рефетчей —
    // кнопка не мигает на каждом фокусе окна.
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const inShell = isDesktopShell();
  const [updateState, setUpdateState] = useState<ShellUpdateState>(IDLE_STATE);
  useEffect(() => {
    if (!inShell) return;
    const pull = () => {
      void getShellUpdateState().then((state) => {
        if (state) setUpdateState(state);
      });
    };
    pull();
    const unsubscribe = onDesktopEvent(
      DESKTOP_BRIDGE_EVENTS.updateState,
      shellUpdateStateSchema,
      setUpdateState,
    );
    // Пуш события теряется, если прилетает eval'ом раньше монтирования
    // слушателя (мост без очереди): дотягиваем состояние опросом — чинит и
    // уже выпущенные оболочки без репуша (фидбек 09.10: точка требовала
    // перезагрузки портала).
    const poll = window.setInterval(pull, 15_000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, [inShell]);

  return {
    manifest: manifest.data ?? null,
    inShell,
    updateState,
  };
}
