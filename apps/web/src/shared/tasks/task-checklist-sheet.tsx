import { ListChecks, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';

/** Пункт чек-листа черновика экспресс-формы (текст; done — при создании). */
export interface DraftChecklistItem {
  id: string;
  text: string;
}

/**
 * Лист чек-листа экспресс-формы создания задачи (модель Битрикс24: окно
 * ПОВЕРХ формы со смещением вниз — но в грамматике Nodus, без чипов-философии
 * Битрикса, вердикт владельца 15.09.2026): пункты добавляются Enter'ом и
 * удаляются крестиком; «Сохранить» возвращает черновик в форму. Один
 * безымянный список — именные мульти-списки не входят в контракт
 * (checklistItemSchema плоский), не выдумываем.
 */
export function TaskChecklistSheet({
  items,
  onChange,
  onClose,
}: {
  items: DraftChecklistItem[];
  onChange: (items: DraftChecklistItem[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');

  function add(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (!value) return;
    onChange([...items, { id: crypto.randomUUID(), text: value }]);
    setText('');
  }

  return (
    // Esc закрывает ЛИСТ, а не всю экспресс-форму (вердикт владельца
    // 15.09.2026): stopPropagation не даёт событию дойти до Radix Dialog
    // (его слушатель — на document, всплытие останавливаем на корне листа).
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      // Ширина листа = ширине формы (вердикт владельца 15.09.2026, как в
      // Битриксе): края прижаты к диалогу, скругление только сверху.
      className="absolute inset-x-0 top-12 bottom-0 z-10 flex flex-col rounded-t-xl border-t border-border bg-popover shadow-[0_-16px_50px_-20px_rgb(22_35_58/0.35)]"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <ListChecks className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <NodeLabel label={ui.tasks.checklist} count={items.length} />
        {items.length > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            0/{items.length} {ui.tasks.checklistDoneLabel}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={ui.common.close}
          className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      {items.length > 0 ? (
        <div className="mx-3 mt-2 h-0.5 shrink-0 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-0 bg-primary" />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* НЕ form: лист живёт внутри <form> экспресс-формы — вложенные
            формы невалидны (React hydration error). Enter ловим на поле. */}
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={ui.tasks.checklistAdd}
            aria-label={ui.tasks.checklistAdd}
            className="h-8 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={() => add()}
            disabled={!text.trim()}
            aria-label={ui.common.add}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="mt-2.5 flex flex-col gap-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent/40"
            >
              <span className="min-w-0 flex-1 truncate">{item.text}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                aria-label={`${ui.filters.reset}: ${item.text}`}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex h-12 shrink-0 items-center justify-end border-t border-border px-3">
        {/* type=button: лист внутри <form> экспресс-формы — иначе клик
            отправлял бы СОЗДАНИЕ задачи раньше времени. */}
        <Button size="sm" type="button" onClick={onClose}>
          {ui.common.save}
        </Button>
      </div>
    </div>
  );
}
