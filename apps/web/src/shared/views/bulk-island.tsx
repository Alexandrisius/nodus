import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Островок массовых действий журнала — ОБЩИЙ каркас всех реестров (вердикт
 * владельца #311: «как островок мультиселекта сообщений в чате»; 25.10.2026 —
 * не заводить свой островок в каждом модуле: механика одна, модуль приносит
 * только свои действия). Выделил строки — снизу по центру всплывает узкое
 * облако команд: счётчик, действия модуля (children), «×» — снять выбор.
 * Обёртка смонтирована ВСЕГДА (закон выдвижных поверхностей): появление —
 * flip классов существующего элемента, плавно с первого раза.
 */
export function BulkIsland({
  visible,
  count,
  ariaLabel,
  pending = false,
  onClear,
  children,
}: {
  /** Есть выделенные строки. */
  visible: boolean;
  /** Счётчик: уходит вместе с островком (фаза выхода), а не с нулём. */
  count: number;
  /** Что за сущность — для скринридера («Контрагенты»). */
  ariaLabel: string;
  /** Идёт массовая операция — островок не принимает клики. */
  pending?: boolean;
  onClear: () => void;
  /** Действия модуля: кнопки/меню в едином стиле островка. */
  children: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      aria-hidden={!visible}
      className={cn(
        'absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm transition-[opacity,translate] duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        pending && 'pointer-events-none opacity-70',
      )}
    >
      <span className="px-2.5 font-mono text-label-sm text-foreground tabular-nums">{count}</span>
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={visible ? 0 : -1}
        className="ml-1 shrink-0 text-muted-foreground"
        aria-label={ui.common.clearSelection}
        title={ui.common.clearSelection}
        onClick={onClear}
      >
        <X className="size-4" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

/** Единый вид действия островка (кнопка или триггер меню). */
export const bulkActionClass =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground';
