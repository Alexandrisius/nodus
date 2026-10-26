import { Lock } from 'lucide-react';
import { useBlocker } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@nodus/ui/components/dialog';

/** Составные части редактора маршрута (#378): баннеры черновика (верх
 *  холста, по центру) и блокер ухода с несохранёнными правками. */

function Banner({
  tone,
  text,
  onReset,
}: {
  tone: 'warning' | 'muted';
  text: string;
  onReset: () => void;
}) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-warning/40 bg-warning-soft/60 px-3 py-1.5 text-xs text-warning'
          : 'absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-accent/40 px-3 py-1.5 text-xs text-muted-foreground'
      }
    >
      <span className="min-w-0 truncate">{text}</span>
      <button
        type="button"
        onClick={onReset}
        className="shrink-0 font-medium underline underline-offset-2"
      >
        {ui.automation.draftReset}
      </button>
    </div>
  );
}

/** «Продолжить черновик от 14:02 / Сбросить». */
export function DraftBanner({ savedAt, onReset }: { savedAt: string; onReset: () => void }) {
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(savedAt),
  );
  return (
    <Banner tone="warning" text={`${ui.automation.draftContinue} ${time}`} onReset={onReset} />
  );
}

/** Маршрут письма — системный каталог (#55, Р4): правка закрыта, холст и
 *  панели только для чтения. Баннер висит на холсте, пока тип письма выбран. */
export function CatalogLockBanner({ text }: { text: string }) {
  return (
    <div className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-none backdrop-blur-sm">
      <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

/** «Черновик устарел — маршрут опубликовали позже / Сбросить». */
export function StaleDraftBanner({ onReset }: { onReset: () => void }) {
  return <Banner tone="muted" text={ui.automation.draftStale} onReset={onReset} />;
}

/** Блокер навигации при несохранённых правках маршрута (#378, раздел 7 спеки):
 *  уход с раздела — с подтверждением (черновик в localStorage смягчает потерю,
 *  но осознанный вопрос честнее тихого «продолжится потом»). */
export function NavigationGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true });
  return (
    <Dialog open={blocker.status === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ui.automation.unsavedTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{ui.automation.unsavedBody}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            {ui.common.cancel}
          </Button>
          <Button onClick={() => blocker.proceed?.()}>{ui.automation.discard}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
