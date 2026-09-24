import { Archive, File, FileText, RotateCw, TriangleAlert, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatBytes } from '../lib/format.js';
import type { PendingAttachment } from './chat-drafts.js';
import { cancelUpload, removePending, retryUpload } from './composer-files.js';

/**
 * Тре вложений композера (A1, #87): карточки выбранных файлов НАД полем
 * ввода, внутри единой поверхности (канон композера: один окаймлённый
 * контейнер). Изображения — плитка-миниатюра с КОЛЬЦОМ прогресса (канон
 * Telegram: radial поверх миниатюры, затемнение); файлы — чип с линейным
 * баром (research: документам — строку с процентом). Крестик — отмена
 * загрузки / удаление готового; ошибка — повтор (retry без повторного
 * выбора файла). Плоско: токены, hairline-бордюры, без теней.
 */

const iconFor = (mime: string) => {
  if (mime.includes('pdf')) return FileText;
  if (/zip|rar|7z|tar|gz/.test(mime)) return Archive;
  if (mime.startsWith('image/')) return FileText;
  return File;
};

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

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      <X className="size-3" strokeWidth={2} />
    </button>
  );
}

function ImageCard({ draftKey, item }: { draftKey: string; item: PendingAttachment }) {
  const uploading = item.status === 'uploading';
  return (
    <span className="relative size-15 shrink-0">
      <span className="block size-full overflow-hidden rounded-lg border border-border">
        {item.objectUrl ? (
          <img src={item.objectUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-muted">
            <FileText className="size-5 text-muted-foreground" strokeWidth={1.75} />
          </span>
        )}
      </span>
      {uploading ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/55">
          <ProgressRing progress={item.progress} />
        </span>
      ) : null}
      {item.status === 'error' ? (
        <span className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-danger-soft/80">
          <TriangleAlert className="size-4 text-danger" strokeWidth={1.75} />
          <button
            type="button"
            onClick={() => retryUpload(draftKey, item.localId)}
            className="rounded-md p-0.5 text-danger transition-colors hover:bg-background/50"
            aria-label={ui.chat.uploadRetry}
            title={ui.chat.uploadRetry}
          >
            <RotateCw className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      ) : null}
      <RemoveButton
        label={uploading ? ui.chat.uploadCancel : ui.chat.uploadRemove}
        onClick={() =>
          uploading ? cancelUpload(draftKey, item.localId) : removePending(draftKey, item.localId)
        }
      />
    </span>
  );
}

function FileCard({ draftKey, item }: { draftKey: string; item: PendingAttachment }) {
  const Icon = iconFor(item.mime);
  const uploading = item.status === 'uploading';
  return (
    <span
      className={cn(
        'relative flex w-44 shrink-0 flex-col gap-1 rounded-lg border border-border bg-card px-2 py-1.5',
        item.status === 'error' && 'border-danger/50',
      )}
    >
      <span className="flex items-center gap-1.5">
        {item.status === 'error' ? (
          <TriangleAlert className="size-4 shrink-0 text-danger" strokeWidth={1.75} />
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={item.fileName}>
          {item.fileName}
        </span>
        {item.status === 'error' ? (
          <button
            type="button"
            onClick={() => retryUpload(draftKey, item.localId)}
            className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={ui.chat.uploadRetry}
            title={ui.chat.uploadRetry}
          >
            <RotateCw className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {uploading ? `${Math.round(item.progress * 100)}%` : formatBytes(item.size)}
        </span>
        <span className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              'block h-full rounded-full transition-[width] duration-200',
              item.status === 'error' ? 'bg-danger' : 'bg-primary',
            )}
            style={{ width: `${Math.round((item.status === 'error' ? 1 : item.progress) * 100)}%` }}
          />
        </span>
      </span>
      <RemoveButton
        label={uploading ? ui.chat.uploadCancel : ui.chat.uploadRemove}
        onClick={() =>
          uploading ? cancelUpload(draftKey, item.localId) : removePending(draftKey, item.localId)
        }
      />
    </span>
  );
}

export function ComposerAttachments({
  draftKey,
  items,
}: {
  draftKey: string;
  items: PendingAttachment[];
}) {
  if (items.length === 0) return null;
  return (
    <span className="flex gap-2 overflow-x-auto px-2 pt-2" data-no-scrollbar>
      {items.map((item) =>
        item.objectUrl ? (
          <ImageCard key={item.localId} draftKey={draftKey} item={item} />
        ) : (
          <FileCard key={item.localId} draftKey={draftKey} item={item} />
        ),
      )}
    </span>
  );
}
