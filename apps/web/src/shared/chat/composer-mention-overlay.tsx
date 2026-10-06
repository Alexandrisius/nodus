import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { personTone } from '../ui/person-tone.js';
import type { DraftMention } from './composer-mention-registry.js';

/**
 * Оверлей @упоминаний поля композера (#176, модель #228 + dev-фидбек 06.10):
 * зеркальный слой ПОД textarea рендерит ВИДИМЫЙ текст (в поле лежит просто
 * ИМЯ сотрудника — без «@» и без разметки токена) и подчёркивает диапазоны
 * реестра персональным тоном. Метрика зеркала 1:1 с полем (тот же текст,
 * ноль компенсаций) — НАТИВНАЯ каретка видима и стоит там, где ввод (канон
 * react-mentions/css-tricks). Заливка-пилюля — только в ПУЗЫРЕ после
 * отправки («как делают все»: Telegram/Slack; пилюля в поле «касалась»
 * набираемого текста — dev-фидбек). «Все» — нейтральный тон.
 *
 * Клик по подчёркнутому имени (каретка попадает в диапазон) открывает
 * КОМПАКТНЫЙ поповер правки (без заголовка, dev-фидбек): ✓/✕/🗑;
 * привязка по id не меняется (операции — реестр стора черновика).
 */

/** Чип под кареткой клика (правка поповером). */
export interface MentionHit extends DraftMention {
  index: number;
}

/** Сегменты видимого текста: пилюли по диапазонам реестра. */
function renderSegments(text: string, mentions: DraftMention[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    if (m.start < cursor || m.end > text.length || m.start >= m.end) continue;
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    parts.push(<Pill key={key++} mention={m} />);
    cursor = m.end;
  }
  parts.push(text.slice(cursor));
  return parts;
}

/** Чип в поле: ИМЯ персонального тона с мягким точечным подчёркиванием —
 *  без «@», без заливки и без полей (метрика зеркала = поле без компенсаций;
 *  зазор после чипа — честный пробел текста). Заливка — в пузыре отправки. */
function Pill({ mention }: { mention: DraftMention }) {
  const tone = mention.id === 'all' ? 'text-foreground' : personTone(mention.id);
  return (
    <span
      className={cn(
        'font-medium underline decoration-dotted decoration-from-font underline-offset-[3px]',
        tone,
      )}
    >
      {mention.label}
    </span>
  );
}

/** Оверлей + поповер правки; рендерится ВНУТРИ relative-обёртки textarea.
 *  editToken/onEditClose — управляемое состояние поповера (клик по чипу
 *  решает композер: попадание каретки клика в диапазон реестра). */
export function MentionFieldOverlay({
  text,
  mentions,
  textareaRef,
  editToken,
  onEditClose,
  onRename,
  onRemove,
}: {
  text: string;
  /** Реестр чипов черновика (#228). */
  mentions: DraftMention[];
  textareaRef: { current: HTMLTextAreaElement | null };
  editToken: MentionHit | null;
  onEditClose: () => void;
  /** Правка label (поповер): стор пересчитает текст и диапазоны. */
  onRename: (index: number, label: string) => void;
  /** Удаление чипа целиком (корзина поповера). */
  onRemove: (index: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const editing = editToken;

  // Фокус в поле правки при открытии поповера (подпись-редактор владеет
  // кареткой, канон окна отправки вложений); Esc/применение возвращают
  // курсор композеру (каретка — ЗА чипом, печать не ломает разметку).
  useEffect(() => {
    if (!editing) return;
    setDraftLabel(editing.label);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing]);

  // Скролл синхронно с textarea: поле скроллится (текст > 45vh) — окно
  // оверлея повторяет scrollTop покадрово.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const sync = () => {
      if (overlayRef.current) overlayRef.current.scrollTop = el.scrollTop;
    };
    el.addEventListener('scroll', sync);
    return () => el.removeEventListener('scroll', sync);
  }, [textareaRef]);

  function closePopover(caretEnd?: number) {
    const token = editing;
    // Каретку — ЗА чип ДО закрытия (или в переданную точку после замены
    // текста): композер синкнет caret-state из DOM — рассинхрон DOM/state
    // держал панель автокомплита открытой (валидация, раунд 2).
    const end = caretEnd ?? (token ? token.start + token.label.length + 1 : undefined);
    if (end !== undefined) textareaRef.current?.setSelectionRange(end, end);
    onEditClose();
  }

  function applyLabel() {
    if (editing && draftLabel.trim().length > 0) {
      onRename(editing.index, draftLabel.trim());
      closePopover(editing.start + draftLabel.trim().length + 1);
      return;
    }
    closePopover();
  }

  function removeToken() {
    if (editing) {
      onRemove(editing.index);
      closePopover(editing.start);
      return;
    }
    closePopover();
  }

  return (
    <>
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden px-1.5 py-1.5 text-base leading-normal whitespace-pre-wrap break-words md:text-sm"
      >
        {renderSegments(text, mentions)}
        {/* Хвостовой перенос строки: pre-wrap textarea держит строку. */}
        {text.endsWith('\n') ? '\n' : null}
      </div>
      {editing ? (
        <span
          role="dialog"
          aria-label={ui.chat.mentionEditText}
          className="absolute bottom-full left-0 z-30 mb-3 flex w-max max-w-full items-center gap-1 rounded-xl border border-border bg-popover p-1.5 shadow-sm"
        >
          <input
            ref={inputRef}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation(); // Esc-каскад композера не закрывает режимы
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLabel();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closePopover();
              }
            }}
            maxLength={128}
            className="h-7 min-w-0 flex-1 rounded-md bg-muted/60 px-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring/40"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-success"
            aria-label={ui.chat.mentionApply}
            title={ui.chat.mentionApply}
            disabled={draftLabel.trim().length === 0}
            onClick={applyLabel}
          >
            <Check className="size-4" strokeWidth={2} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={ui.chat.mentionCancel}
            title={ui.chat.mentionCancel}
            onClick={() => closePopover()}
          >
            <X className="size-4" strokeWidth={2} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-destructive"
            aria-label={ui.chat.mentionRemove}
            title={ui.chat.mentionRemove}
            onClick={removeToken}
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
          </Button>
        </span>
      ) : null}
    </>
  );
}
