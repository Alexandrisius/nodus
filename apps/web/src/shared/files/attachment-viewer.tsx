import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Pencil, X } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';
import { Spinner } from '@nodus/ui/components/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

import { useOfficeConfig, useOfficeSession } from './api.js';
import { DownloadCard } from './download-card.jsx';
import { MediaViewer } from './media-viewer.jsx';
import { OfficeViewer } from './office-viewer.jsx';
import { PdfViewer } from './pdf-viewer.jsx';
import { resolveViewerRoute } from './viewer-registry.js';
import { useViewerStore } from './viewer-store.js';

/**
 * Модалка-обёртка просмотрщика вложений (#138): шапка (имя, версия,
 * «Скачать», «Редактировать» по праву) + тело по маршруту реестра
 * (офис → ONLYOFFICE, PDF → pdf.js, медиа → нативно, прочее → скачивание).
 * Один вьюер на приложение (стор), портал z-[80], Esc/задник закрывают,
 * фокус возвращается источнику. Спека: «как в Битриксе» — просмотр
 * встроенным редактором, правка отдельным режимом.
 *
 * Геометрия окна = канон карточек сущностей (ADR-0009): рама inset-2,
 * правый край у служебной полосы (stripW передаёт app-shell из состояния
 * полосы — общие константы слою shared недоступны), скругление карточки,
 * transition-[right] синхронно с раскрытием полосы.
 */
export function AttachmentViewer({ stripW = 0 }: { stripW?: number }) {
  const target = useViewerStore((s) => s.target);
  const close = useViewerStore((s) => s.close);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [engineFailed, setEngineFailed] = useState(false);
  const [sessionStale, setSessionStale] = useState(0);

  const configQuery = useOfficeConfig();
  const officeConfig = configQuery.data;

  // Сброс режима при открытии новой цели.
  useEffect(() => {
    setMode('view');
    setEngineFailed(false);
    setSessionStale(0);
  }, [target?.fileId]);

  const route = useMemo(
    () =>
      target && officeConfig
        ? resolveViewerRoute(target.name, target.mime, target.size, {
            officeEnabled: officeConfig.enabled && !engineFailed,
            maxViewBytes: officeConfig.maxViewBytes,
          })
        : null,
    [target, officeConfig, engineFailed],
  );

  const sessionQuery = useOfficeSession(target?.fileId ?? null, mode, route?.kind === 'office');

  const closeOnEsc = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    },
    [close],
  );

  useEffect(() => {
    if (!target) return;
    document.addEventListener('keydown', closeOnEsc);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      document.removeEventListener('keydown', closeOnEsc);
      previous?.focus?.();
    };
  }, [target, closeOnEsc]);

  if (!target || !route) return null;

  const session = sessionQuery.data ?? null;
  const canSwitchToEdit = route.kind === 'office' && mode === 'view' && session?.canEdit === true;
  const downloadUrl = target.url;

  return createPortal(
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={ui.files.viewerTitle}
    >
      <div className="absolute inset-0 bg-background/80" onClick={close} />
      <div
        className="absolute inset-y-2 left-2 flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xl transition-[right] duration-200"
        style={{ right: stripW + 8 }}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium" title={target.name}>
              {target.name}
            </p>
            {session ? (
              <p className="text-[12px] text-muted-foreground">
                {ui.files.versionLabel} {session.version}
                {session.mode === 'view' ? ` · ${ui.files.readingMode}` : ''}
              </p>
            ) : null}
          </div>
          {canSwitchToEdit ? (
            <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
              <Pencil />
              {ui.files.edit}
            </Button>
          ) : null}
          {downloadUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon-sm" aria-label={ui.files.download}>
                  <a href={downloadUrl} download={target.name}>
                    <Download />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{ui.files.download}</TooltipContent>
            </Tooltip>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label={ui.files.close}
            autoFocus
          >
            <X />
          </Button>
        </header>

        <div className="min-h-0 flex-1">
          {route.kind === 'office' ? (
            sessionQuery.isPending ? (
              <PreparingIndicator />
            ) : sessionQuery.isError || !session ? (
              <DownloadCard
                name={target.name}
                size={target.size}
                url={downloadUrl}
                reason="office_disabled"
              />
            ) : engineFailed ? (
              <DownloadCard
                name={target.name}
                size={target.size}
                url={downloadUrl}
                reason="office_disabled"
              />
            ) : (
              <OfficeViewer
                key={`${session.document.key}:${session.mode}:${sessionStale}`}
                session={session}
                onOutdated={() => {
                  // Документ пересохранён — сессия с новым ключом версии.
                  setSessionStale((n) => n + 1);
                  void sessionQuery.refetch();
                }}
                onEngineError={() => setEngineFailed(true)}
              />
            )
          ) : route.kind === 'pdf' ? (
            downloadUrl ? (
              <PdfViewer url={downloadUrl} fileName={target.name} />
            ) : (
              <DownloadCard name={target.name} size={target.size} url={null} reason="unsupported" />
            )
          ) : route.kind === 'media' ? (
            downloadUrl ? (
              <MediaViewer url={downloadUrl} mime={target.mime} name={target.name} />
            ) : (
              <DownloadCard name={target.name} size={target.size} url={null} reason="unsupported" />
            )
          ) : (
            <DownloadCard
              name={target.name}
              size={target.size}
              url={downloadUrl}
              reason={route.reason ?? 'unsupported'}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PreparingIndicator() {
  return (
    <div className="grid size-full place-items-center">
      <Spinner className="size-5" />
    </div>
  );
}
