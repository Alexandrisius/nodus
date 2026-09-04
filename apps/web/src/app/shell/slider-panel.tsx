import { X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

/** Стек слайдеров: ESC закрывает только верхнюю панель (§10.2). */
const stack: string[] = [];

/** Детальная панель — большой sheet снизу вверх (референс: Битрикс): во всю
 * ширину с полями и отступом сверху, чтобы каркас оставался виден; кнопки
 * управления и закрытие — слева вверху. Уровень 2 уходит глубже вниз-вправо. */
export function SliderPanel({
  breadcrumbs,
  level = 1,
  onClose,
  children,
}: {
  breadcrumbs: ReactNode;
  level?: 1 | 2;
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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          'paper-surface animate-in slide-in-from-bottom absolute inset-x-3 bottom-0 top-10 flex flex-col rounded-t-2xl shadow-2xl duration-300',
          level === 2 && 'inset-x-10 top-16',
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-pencil/30 px-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:bg-pencil/10"
            onClick={onClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-card-foreground/60">
            {breadcrumbs}
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  );
}
