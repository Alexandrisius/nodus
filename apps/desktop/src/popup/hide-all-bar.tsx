import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ui } from '@nodus/contracts';

/**
 * Плашка «Скрыть все» над стеком попапов (модель Telegram HideAllButton):
 * пилюля в стиле карточек (фон, рамка, то же скругление), по центру полосы;
 * клик по всей полосе гасит стек и очередь (бейджи ведёт портал). Без тени —
 * окно прозрачное, тень обрезалась прямыми углами (фидбек 08.10).
 */
export function HideAllBar() {
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }, []);

  return (
    <div className="flex h-screen w-screen cursor-pointer items-center justify-center bg-transparent">
      <button
        type="button"
        onClick={() => void invoke('popup_close_all')}
        className="bg-card text-muted-foreground hover:text-foreground rounded-xl border px-3 py-1 font-sans text-[12px] font-medium transition-colors"
      >
        {ui.desktop.hideAll}
      </button>
    </div>
  );
}
