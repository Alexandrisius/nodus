import { GripVertical, RotateCw, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { FileTypeIcon } from '../files/file-type-icon.js';
import { formatBytes } from '../lib/format.js';
import type { PendingAttachment } from './chat-drafts.js';
import { cancelUpload, removePending, retryUpload } from './composer-files.js';

/**
 * Строка окна отправки вложений (#144): drag-точки сортировки (референс
 * Битрикс24), превью картинки/иконка типа, имя, размер или процент загрузки,
 * повтор при ошибке, крестик снятия. Плоско: токены, без теней.
 *
 * Drag — БЕЗ dnd-kit (вердикт 29.09.2026): PointerSensor dnd-kit на всё время
 * перетаскивания подавляет выделение/каретку в полях ввода (selectionchange →
 * removeTextSelection, жёстко в AbstractPointerSensor) — супер-курсор подписи
 * умирал в момент активации drag. Наша механика: pointerdown на ручке с
 * preventDefault (фокус НЕ уходит из подписи), live-reorder делает хозяин
 * окна по elementsFromPoint; строка сама не двигается transform'ом — нет ни
 * фантомного скролла, ни рамок. Клавиатурная сортировка — задел #146.
 */

function ProgressRing({ progress }: { progress: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-background/40"
      />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
        transform="rotate(-90 14 14)"
        className="text-primary-foreground"
      />
    </svg>
  );
}

export function AttachSendRow({
  scope,
  item,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPreview,
}: {
  scope: string;
  item: PendingAttachment;
  dragging: boolean;
  onDragStart: () => void;
  /** Живой реордер: координаты указателя — хозяин окна меняет порядок. */
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  /** Клик по миниатюре картинки — просмотр в лайтбоксе поверх окна (#144). */
  onPreview?: () => void;
}) {
  const uploading = item.status === 'uploading';

  function onHandlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    // Фокус остаётся в подписи (супер-курсор живёт и во время drag).
    event.preventDefault();
    onDragStart();
    const move = (ev: PointerEvent) => onDragMove(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onDragEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  return (
    <li
      data-attach-row={item.localId}
      className={cn(
        'flex items-center gap-2 rounded-lg px-1.5 py-1.5',
        // Тянется — мягкий тон БЕЗ рамки (вердикт 29.09.2026: рамка уродует).
        dragging && 'bg-accent/40',
      )}
    >
      <button
        type="button"
        onPointerDown={onHandlePointerDown}
        aria-label={ui.chat.attachReorder}
        title={ui.chat.attachReorder}
        className="shrink-0 cursor-grab touch-none rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <GripVertical className="size-4" strokeWidth={1.75} />
      </button>
      {item.objectUrl ? (
        <button
          type="button"
          onClick={onPreview}
          aria-label={ui.chat.attachViewImage}
          title={ui.chat.attachViewImage}
          className="relative size-10 shrink-0 cursor-zoom-in rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
        >
          <span className="block size-full overflow-hidden rounded-lg border border-border">
            <img src={item.objectUrl} alt="" className="size-full object-cover" />
          </span>
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/55">
              <ProgressRing progress={item.progress} />
            </span>
          ) : null}
        </button>
      ) : (
        <span className="relative size-10 shrink-0">
          <span className="block size-full overflow-hidden rounded-lg border border-border">
            <span className="flex size-full items-center justify-center bg-muted">
              <FileTypeIcon mime={item.mime} className="size-5" />
            </span>
          </span>
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/55">
              <ProgressRing progress={item.progress} />
            </span>
          ) : null}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={item.fileName}>
          {item.fileName}
        </span>
        <span className="block truncate font-mono text-badge text-muted-foreground tabular-nums">
          {uploading
            ? `${Math.round(item.progress * 100)}%`
            : item.status === 'error'
              ? ui.chat.uploadFailed
              : formatBytes(item.size)}
        </span>
      </span>
      {item.status === 'error' ? (
        <button
          type="button"
          onClick={() => retryUpload(scope, item.localId)}
          aria-label={ui.chat.uploadRetry}
          title={ui.chat.uploadRetry}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <RotateCw className="size-4" strokeWidth={1.75} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() =>
          uploading ? cancelUpload(scope, item.localId) : removePending(scope, item.localId)
        }
        aria-label={uploading ? ui.chat.uploadCancel : ui.chat.uploadRemove}
        title={uploading ? ui.chat.uploadCancel : ui.chat.uploadRemove}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </li>
  );
}
