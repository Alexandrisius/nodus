import { Check, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CounterpartyRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Input } from '@nodus/ui/components/input';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { useCounterpartiesList, useCreateCounterparty } from './api.js';

/**
 * Автокомплит контрагента из справочника (textbox с подсказками — модель
 * Битрикс24, тот же указательный гард Radix Popover, что у FilterCombobox):
 * ввод фильтрует по краткому/полному названию и УНП; отсутствующего
 * контрагента секретарь создаёт «на лету» одной строкой (имя = введённый
 * текст, реквизиты дополняются в карточке). Живёт в shared: потребители —
 * корреспонденция (регистрация, композер) и фича контрагентов (I6).
 */
export function CounterpartyCombobox({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: CounterpartyRef | null;
  onChange: (ref: CounterpartyRef | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const { data } = useCounterpartiesList();
  const create = useCreateCounterparty();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const fromPointer = useRef(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const items = data?.items ?? [];
  const q = text.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (c) =>
          c.shortName.toLowerCase().includes(q) ||
          c.fullName.toLowerCase().includes(q) ||
          (c.unp ?? '').includes(q),
      )
    : items;
  const exact =
    q !== '' &&
    items.some((c) => c.shortName.toLowerCase() === q || c.fullName.toLowerCase() === q);

  function choose(ref: CounterpartyRef | null) {
    onChange(ref);
    setText('');
    setOpen(false);
  }

  async function createInline() {
    const name = text.trim();
    if (!name || create.isPending) return;
    const card = await create.mutateAsync({
      fullName: name,
      shortName: name,
      unp: null,
      address: null,
    });
    choose({ id: card.id, name: card.shortName });
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
        <div ref={anchorRef} className={cn('relative min-w-0 flex-1', className)}>
          <Input
            value={open ? text : (value?.name ?? '')}
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
            placeholder={ui.counterparties.searchPlaceholder}
            aria-label={ariaLabel}
            className={cn('h-8 w-full text-sm', value && !open ? 'pr-7' : '')}
          />
          {value && !open ? (
            <button
              type="button"
              onClick={() => choose(null)}
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
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => choose({ id: c.id, name: c.shortName })}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/60',
              c.id === value?.id ? 'text-port' : 'text-secondary-foreground',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{c.shortName}</span>
            {c.unp ? (
              <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                {c.unp}
              </span>
            ) : null}
            {c.id === value?.id ? <Check className="size-3.5 shrink-0" strokeWidth={1.75} /> : null}
          </button>
        ))}
        {q !== '' && !exact ? (
          <button
            type="button"
            disabled={create.isPending}
            onClick={createInline}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-info hover:bg-accent/60 disabled:opacity-50"
          >
            <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">
              {ui.counterparties.createInline} «{text.trim()}»
            </span>
          </button>
        ) : null}
        {filtered.length === 0 && q === '' ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {ui.counterparties.empty}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
