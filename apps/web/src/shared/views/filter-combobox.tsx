import { Check, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { PersonAvatar } from '../ui/person-avatar.js';
import type { FilterOption } from './list-filters.js';

/**
 * Поле фильтра-справочника — TEXTBOX с подсказками (модель Битрикс24, вердикт
 * владельца: «не тупо выпадающий список»): ввод фильтрует варианты по
 * подстроке, подсказки — списком под полем (person — с аватарами), выбранное
 * значение — текстом в поле с × сброса; открытие по клику (gotcha Radix
 * Popover-из-фокуса — тот же указательный гард, что у поисковой строки).
 */
export function FilterCombobox({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: FilterOption[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const fromPointer = useRef(false);
  // onInteractOutside-гард для якоря — как у поисковой строки (gotcha Radix
  // DismissableLayer: иначе повторный клик по полю при открытом списке
  // дисмиссит его с инверсией после нашего onClick).
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const q = text.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  function choose(v: string | undefined) {
    onChange(v);
    setText('');
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText('');
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative min-w-0 flex-1">
          <Input
            value={open ? text : (selected?.label ?? '')}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onPointerDown={() => {
              fromPointer.current = true;
            }}
            onFocus={() => {
              if (!fromPointer.current) setOpen(true);
            }}
            onClick={() => {
              fromPointer.current = false;
              setOpen(true);
            }}
            placeholder={ui.filters.any}
            aria-label={ariaLabel}
            className={cn('h-8 w-full text-sm', selected && !open ? 'pr-7' : '')}
          />
          {selected && !open ? (
            <button
              type="button"
              onClick={() => choose(undefined)}
              aria-label={`${ui.filters.reset}: ${ariaLabel}`}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="max-h-64 w-(--radix-popover-anchor-width) overflow-y-auto p-1"
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {ui.filters.notFound}
          </p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/60',
                o.value === value ? 'text-port' : 'text-secondary-foreground',
              )}
            >
              {o.avatarUrl !== undefined ? (
                <PersonAvatar name={o.label} avatarUrl={o.avatarUrl} className="size-5 shrink-0" />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value ? (
                <Check className="size-3.5 shrink-0" strokeWidth={1.75} />
              ) : null}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
