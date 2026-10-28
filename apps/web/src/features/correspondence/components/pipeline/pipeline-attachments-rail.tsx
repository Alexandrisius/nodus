import { Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { FileTypeIcon } from '../../../../shared/files/file-type-icon.js';
import { formatBytes } from '../../../../shared/lib/format.js';

/** Вложения письма, открываемые до регистрации: текст письма — отдельная
 *  строка «Письмо», служебный .eml и inline-картинки в список не попадают. */
export function pipelineAttachmentsOf(letter: LetterDetail | undefined) {
  return letter
    ? letter.attachments.filter((file) => file.role === 'attachment' && !file.inline)
    : [];
}

/** Строка колонки: иконка выровнена с первой строкой текста, вторая строка
 *  (роль/размер) — под текстом с тем же отступом. Одинаковая структура у
 *  «Письма» и вложений — одинаковая высота и ровный левый край (вердикт
 *  владельца 28.10). */
function RailItem({
  active,
  icon,
  title,
  meta,
  metaMono = false,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  meta: string;
  /** Размер файла — моноширинно с табулярными цифрами; роль письма — обычным. */
  metaMono?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-[8px] px-2 py-1.5 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-ring',
        active ? 'bg-accent text-foreground' : 'text-secondary-foreground hover:bg-accent/50',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-xs leading-snug">{title}</span>
      </span>
      <span
        className={cn(
          'pl-6 text-label-sm text-muted-foreground',
          metaMono && 'font-mono tabular-nums',
        )}
      >
        {meta}
      </span>
    </button>
  );
}

/**
 * Колонка файлов письма в конвейере «Новые» (#56, вердикт владельца 28.10):
 * секретарь на регистрации видит ВСЕ вложения списком с размерами, а не
 * обрезанную ленту — при десятках файлов список скроллится, выбранный
 * открывается в зоне просмотра справа. «Письмо» возвращает к телу; счётчик —
 * только настоящие вложения (тело письма вложением не считается).
 */
export function PipelineAttachmentsRail({
  letter,
  attachmentId,
  onSelect,
}: {
  letter: LetterDetail;
  attachmentId: string | null;
  onSelect: (attachmentId: string | null) => void;
}) {
  const attachments = pipelineAttachmentsOf(letter);
  if (attachments.length === 0) return null;
  return (
    <aside
      aria-label={ui.letters.card.attachments}
      className="w-52 shrink-0 overflow-y-auto border-r border-border p-2"
    >
      <RailItem
        active={attachmentId === null}
        icon={<Mail className="size-4 text-muted-foreground" strokeWidth={1.75} />}
        title={ui.letters.card.tabBody}
        meta={
          letter.body.kind === 'document'
            ? ui.letters.card.fileRoles.main
            : ui.letters.card.fileRoles.body
        }
        onClick={() => onSelect(null)}
      />
      <p className="px-2 pt-3 pb-1 text-label-sm text-muted-foreground">
        {ui.letters.card.attachments} · {attachments.length}
      </p>
      {attachments.map((file) => (
        <RailItem
          key={file.id}
          active={attachmentId === file.id}
          icon={<FileTypeIcon mime={file.mime} className="size-4" />}
          title={file.name}
          meta={formatBytes(file.size)}
          metaMono
          onClick={() => onSelect(file.id)}
        />
      ))}
    </aside>
  );
}
