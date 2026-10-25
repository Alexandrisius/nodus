import { ChevronDown } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import type { CustomFieldDefinition, CustomFieldRef, CustomFieldValue } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/** Вариант редактора: `inline` — правка по месту в карточке (значение
 *  выглядит текстом, клик открывает ввод), `form` — постоянный контрол
 *  (окно перехода, форма типа). */
export type EditorVariant = 'inline' | 'form';

export interface EditorProps {
  definition: CustomFieldDefinition;
  value: CustomFieldValue | undefined;
  refs: readonly CustomFieldRef[];
  disabled: boolean;
  variant: EditorVariant;
  /** `refs` — ссылка выбранного значения: оптимистичная правка кладёт её в
   *  кэш сразу, не дожидаясь ответа сервера (Р6). */
  onCommit: (value: CustomFieldValue | null, refs?: CustomFieldRef[]) => void;
}

/** Триггер выбора: в карточке — строка-значение с ховер-заливкой, в форме —
 *  контрол в рамке, как у системных полей окна. */
export function EditorTrigger({
  children,
  variant,
  disabled,
  ariaLabel,
  open,
  onClick,
  ref,
}: {
  children: ReactNode;
  variant: EditorVariant;
  disabled: boolean;
  ariaLabel: string;
  open?: boolean;
  onClick?: () => void;
  /** React 19: ref — обычный проп; нужен Radix `asChild` (поповеры пикеров). */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-left text-sm transition-colors disabled:cursor-default',
        variant === 'inline'
          ? '-mx-1 min-h-7 rounded-md px-1 hover:bg-accent/40 focus-visible:bg-accent/40'
          : 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 hover:bg-accent/40 dark:bg-input/30',
        open && 'bg-accent/40',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {variant === 'form' ? (
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      ) : null}
    </button>
  );
}

/** Подсказка ошибки под контролем (aria-describedby у вызывающего). */
export function EditorError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="text-xs text-danger">
      {text}
    </p>
  );
}
