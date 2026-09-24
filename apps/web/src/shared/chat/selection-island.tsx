import { Copy, Forward, Trash2, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import type { ComposerSelection } from './chat-composer.js';

/**
 * Тулбар узкого островка батч-команд (A6, #87; вердикт 24.09): композер в
 * селекте сужается до него, ввод не нужен. «Переслать» — ТЕКСТОМ (самая
 * популярная команда очевидна), корзина (только когда все свои) / копировать /
 * выход — значками. frozen — фаза выхода из селекта: островок ещё
 * расширяется, кнопки уже не кликаются (pointer-events-none).
 */
export function SelectionToolbar({ sel, frozen }: { sel: ComposerSelection; frozen: boolean }) {
  return (
    <span
      role="toolbar"
      data-testid="selection-bar"
      aria-label={`${ui.chat.selectedPrefix} ${sel.count}`}
      className={cn('flex w-full items-center gap-0.5', frozen && 'pointer-events-none')}
    >
      <span className="px-1.5 font-mono text-label-sm text-muted-foreground tabular-nums">
        {sel.count}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5 text-muted-foreground"
        aria-label={ui.chat.menu.forward}
        title={ui.chat.menu.forward}
        onClick={sel.onForward}
      >
        <Forward className="size-4" strokeWidth={1.75} />
        {ui.chat.menu.forward}
      </Button>
      {sel.allMine ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={ui.chat.menu.delete}
          title={ui.chat.menu.delete}
          onClick={sel.onDelete}
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground"
        aria-label={ui.chat.menu.copy}
        title={ui.chat.menu.copy}
        onClick={sel.onCopy}
      >
        <Copy className="size-4" strokeWidth={1.75} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto shrink-0 text-muted-foreground"
        aria-label={ui.chat.clearSelection}
        title={ui.chat.clearSelection}
        onClick={sel.onClear}
      >
        <X className="size-4" strokeWidth={1.75} />
      </Button>
    </span>
  );
}
