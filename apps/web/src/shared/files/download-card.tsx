import { Archive, Download, FileText } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';

import { formatBytes } from '../lib/format.js';

/**
 * Карточка-фолбэк (#138): формат без просмотра, файл больше потолка
 * редактора или движок выключен — скачивание без ошибок UI (критерий
 * приёмки «деградация без ошибок»).
 */
export function DownloadCard({
  name,
  size,
  url,
  reason,
}: {
  name: string;
  size: number;
  url: string | null;
  reason: 'unsupported' | 'too_large' | 'office_disabled';
}) {
  const title =
    reason === 'too_large'
      ? ui.files.tooLargeTitle
      : reason === 'office_disabled'
        ? ui.files.officeUnavailable
        : ui.files.downloadOnlyTitle;
  const hint = reason === 'too_large' ? ui.files.tooLargeHint : ui.files.downloadOnlyHint;
  const Icon = reason === 'unsupported' ? Archive : FileText;
  return (
    <div className="grid size-full place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="grid size-12 place-items-center rounded-[10px] bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
        <p className="text-[13px] text-muted-foreground">
          {name} · {formatBytes(size)}
        </p>
        {url ? (
          <Button asChild variant="outline" size="sm">
            <a href={url} download={name}>
              <Download />
              {ui.files.download}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
