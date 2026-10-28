import { Pencil, X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { ui } from '@nodus/contracts';

/** Значение-ссылка карточки письма (#55, U7): имя ведёт в карточку сущности,
 *  карандаш — правка по месту, крестик — очистка необязательного. Те же
 *  подложки и размеры, что у полей-строк карточки задачи. */

export const valueButton =
  '-mx-1 inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md px-1 text-left transition-colors hover:bg-accent';

// «Не задано» — короткая фикс-метка: перенос по словам внутри кнопки-значения
// ломал ритм строк доски (intrinsic-ширина вложенных flex сжимала кнопку до
// полуслова), поэтому nowrap.
export const notSet = (
  <span className="text-muted-foreground whitespace-nowrap">{ui.common.notSet}</span>
);

export const editLabel = (label: string) => `${ui.letters.card.editHint}: ${label}`;

/** Значение-дата/номер в строке доски: моно-кегль данных (типографика канона). */
export const mono = (text: string): ReactNode => (
  <span className="font-mono text-label-sm tabular-nums">{text}</span>
);

/** Карандаш значения-ссылки (клик по самому значению открывает карточку).
 *  Пропсы и ref прокидываются: кнопка бывает триггером поповера (asChild). */
export function EditButton({ label, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={editLabel(label)}
      title={editLabel(label)}
      {...props}
      className="shrink-0 rounded p-1 text-muted-foreground opacity-50 transition-opacity group-hover/value:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
    >
      <Pencil className="size-3" strokeWidth={1.75} />
    </button>
  );
}

export function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${ui.filters.reset}: ${label}`}
      title={`${ui.filters.reset}: ${label}`}
      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/value:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
    >
      <X className="size-3" strokeWidth={1.75} />
    </button>
  );
}
