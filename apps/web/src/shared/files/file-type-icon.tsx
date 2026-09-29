import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@nodus/ui/lib/utils';

/**
 * Иконка типа файла — ЕДИНАЯ точка маппинга mime → глиф + цвет (#144):
 * цвета по референсу Битрикс24 (pdf красный, офис синий, таблицы зелёные,
 * архивы оранжевые, медиа фиолетовые) — токены --file-* в globals.css обеих
 * тем; формат без рода (txt и т.п.) — нейтральный File. Размер задаёт хозяин
 * className (дефолт size-4), цвет глифа — только токены типа.
 */
const FILE_KINDS: { test: RegExp; icon: LucideIcon; color: string }[] = [
  { test: /pdf/, icon: FileText, color: 'text-file-pdf' },
  { test: /msword|wordprocessingml|rtf/, icon: FileText, color: 'text-file-doc' },
  { test: /sheet|excel|csv/, icon: FileSpreadsheet, color: 'text-file-sheet' },
  { test: /zip|rar|7z|tar|gz/, icon: FileArchive, color: 'text-file-archive' },
  { test: /^image\//, icon: FileImage, color: 'text-file-media' },
  { test: /^audio\//, icon: FileAudio, color: 'text-file-media' },
  { test: /^video\//, icon: FileVideo, color: 'text-file-media' },
];

export function FileTypeIcon({ mime, className }: { mime: string; className?: string }) {
  const kind = FILE_KINDS.find((k) => k.test.test(mime));
  const Icon = kind?.icon ?? File;
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn('size-4', kind?.color ?? 'text-muted-foreground', className)}
    />
  );
}
