import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ui } from '@nodus/contracts';

/**
 * Плашка «Скрыть все» над стеком попапов (модель Telegram HideAllButton):
 * капсула на ВСЮ высоту окна — позиционирование задаёт Rust, зазор до
 * верхнего попапа ровно равен межпопапному (GAP); скругление = половина
 * высоты (капсула), обрезать нечего. Клик по всей полосе гасит стек и
 * очередь; показывается только при полном столбике. Без тени — окно
 * прозрачное, тень обрезалась прямыми углами.
 */
export function HideAllBar() {
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }, []);

  return (
    <div className="h-screen w-screen bg-transparent py-1">
      <button
        type="button"
        onClick={() => void invoke('popup_close_all')}
        className="bg-card text-muted-foreground hover:text-foreground hover:bg-accent flex h-full w-full cursor-pointer items-center justify-center rounded-full border font-sans text-[12px] font-medium transition-colors"
      >
        {ui.desktop.hideAll}
      </button>
    </div>
  );
}
