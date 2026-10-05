import { useEffect, useRef, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { buildMentionToken, parseMentionSegments, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { personTone, personToneVar } from '../ui/person-tone.js';
import {
  mentionTokens,
  removeMentionToken,
  replaceMentionLabel,
  type CaretMention,
} from './composer-mentions.js';

/**
 * Оверлей @упоминаний поля композера (#176): зеркальный слой ПОД textarea
 * рендерит токены чипами (текст поля прозрачный, каретка видима; паттерн
 * highlight-within-textarea). Слой строго повторяет типографику поля
 * (px-1.5 py-1.5 text-base md:text-sm, pre-wrap, break-words) — перенос
 * строк совпадает с textarea 1:1; скролл длинного текста синхронизируется
 * слушателем scroll на самом textarea.
 *
 * Клик по видимой части чипа (label) открывает поповер правки отображаемого
 * текста: ✓ применить / ✕ отмена / 🗑 удалить метку целиком (вердикт
 * владельца 04.10 — без больших кнопок); привязка по id не меняется.
 */

/** Зеркало токена в оверлее: СЫРОЙ текст токена рисуется теми же глифами,
 *  что и textarea (каретка живёт в raw-координатах — ширины и ПЕРЕНОСЫ
 *  обязаны совпадать 1:1, code-ревью): видима только label-часть на
 *  пилюле-тинте, обрамление `@[`/`]` и хвост `(user:uuid)` — прозрачные
 *  глифы. Без whitespace-pre: инлайны рвутся по строкам как в textarea
 *  (пилюля честно разрывается, модель Slack); паддинг пилюли скомпенсирован
 *  отрицательным маргином и вес наследуется — поток не шире сырых глифов. */
function OverlayChip({ id, label }: { id: string; label: string }) {
  return (
    <>
      <span style={{ color: 'transparent' }}>@[</span>
      <span
        style={{
          backgroundColor: `color-mix(in oklch, ${personToneVar(id)} 14%, transparent)`,
        }}
        className={cn('-mx-0.5 rounded-md px-0.5', personTone(id))}
      >
        {label || '@'}
      </span>
      <span style={{ color: 'transparent' }}>{`](user:${id})`}</span>
    </>
  );
}

/** Токен, чей видимый label накрыт смещением каретки (клик в чип). */
export function mentionAtOffset(text: string, offset: number): CaretMention | null {
  return (
    mentionTokens(text).find(
      (t) => offset > t.start + 1 && offset <= t.start + 2 + t.label.length,
    ) ?? null
  );
}

/** Оверлей + поповер правки; рендерится ВНУТРИ relative-обёртки textarea.
 *  editToken/onEditClose — управляемое состояние поповера (клик по чипу
 *  решает композер: mentionAtOffset по каретке клика). */
export function MentionFieldOverlay({
  text,
  setText,
  textareaRef,
  editToken,
  onEditClose,
}: {
  text: string;
  /** setText стора черновика (правка/удаление токена). */
  setText: (next: string) => void;
  textareaRef: { current: HTMLTextAreaElement | null };
  editToken: CaretMention | null;
  onEditClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const editing = editToken;

  // Фокус в поле правки при открытии поповера (подпись-редактор владеет
  // кареткой, канон окна отправки вложений); Esc/применение возвращают
  // курсор композеру (каретка — ЗА токеном, печать не ломает разметку).
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
    // Каретку — ЗА токен ДО закрытия (или в переданную точку после замены
    // текста): композер синкнет caret-state из DOM — рассинхрон DOM/state
    // держал панель автокомплита открытой (валидация, раунд 2).
    const end = caretEnd ?? token?.end;
    if (end !== undefined) textareaRef.current?.setSelectionRange(end, end);
    onEditClose();
  }

  function applyLabel() {
    if (editing && draftLabel.trim().length > 0) {
      setText(replaceMentionLabel(text, editing.index, draftLabel.trim()));
      const newEnd = editing.start + buildMentionToken(draftLabel.trim(), editing.id).length;
      closePopover(newEnd);
      return;
    }
    closePopover();
  }

  function removeToken() {
    if (editing) {
      setText(removeMentionToken(text, editing.index));
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
        {parseMentionSegments(text).map((segment, i) =>
          segment.kind === 'mention' ? (
            <OverlayChip key={i} id={segment.id} label={segment.label} />
          ) : (
            segment.value
          ),
        )}
        {/* Хвостовой перенос строки: pre-wrap textarea держит строку. */}
        {text.endsWith('\n') ? '\n' : null}
      </div>
      {editing ? (
        <span
          role="dialog"
          aria-label={ui.chat.mentionEditText}
          className="absolute bottom-full left-0 z-30 mb-1.5 flex w-max max-w-full items-center gap-1 rounded-xl border border-border bg-popover p-1.5 pl-2.5 shadow-sm"
        >
          <span className="w-32 shrink-0 text-xs text-muted-foreground">
            {ui.chat.mentionEditText}
          </span>
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
