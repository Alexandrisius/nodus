import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ui } from '@nodus/contracts';

/**
 * Плашка «Скрыть все» над стеком попапов (модель Telegram HideAllButton):
 * пилюля в стиле карточек, прижата к НИЗУ окна — зазор до верхнего попапа
 * ровно такой же, как между карточками (GAP задаёт Rust при позиционировании).
 * Клик по всей полосе гасит стек и очередь; показывается только при полном
 * столбике. Без тени — окно прозрачное, тень обрезалась прямыми углами.
 */
export function HideAllBar() {
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }, []);

  return (
    <div className="flex h-screen w-screen cursor-pointer items-end justify-center bg-transparent">
      <button
        type="button"
        onClick={() => void invoke('popup_close_all')}
        className="bg-card text-muted-foreground hover:text-foreground flex w-full items-center justify-center rounded-xl border font-sans text-[12px] font-medium transition-colors"
      >
        {ui.desktop.hideAll}
      </button>
    </div>
  );
}
