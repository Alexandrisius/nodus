import { X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

/** Стек слайдеров: ESC закрывает только верхнюю панель (§10.2). */
const stack: string[] = [];

export function SliderPanel({
  breadcrumbs,
  level = 1,
  placement = 'right',
  onClose,
  children,
}: {
  breadcrumbs: ReactNode;
  level?: 1 | 2;
  placement?: 'right' | 'bottom';
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();

  useEffect(() => {
    stack.push(id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === id) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      window.removeEventListener('keydown', onKey);
    };
  }, [id, onClose]);

  return (
    <>
      <div className="absolute inset-0 bg-black/15" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="false"
        className={cn(
          'animate-in absolute flex flex-col bg-background shadow-2xl',
          placement === 'right' &&
            cn(
              'slide-in-from-right inset-y-0 right-0 border-l duration-200',
              level === 1 ? 'w-[72%] max-w-[1100px]' : 'w-[60%] max-w-[900px]',
            ),
          placement === 'bottom' &&
            'slide-in-from-bottom inset-x-0 bottom-0 top-6 rounded-t-2xl border-t duration-300',
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs}
          </nav>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={onClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </>
  );
}
