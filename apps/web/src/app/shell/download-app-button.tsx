import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';

import { desktopApplyUpdate } from '../../shared/desktop/desktop-bridge.js';
import { windowsInstallerUrl } from '../../shared/desktop/desktop-manifest.js';
import { useDesktopApp } from '../../shared/desktop/use-desktop-app.js';
import { formatDate } from '../../shared/lib/format.js';

const OPEN_DELAY_MS = 140;
const CLOSE_DELAY_MS = 200;
const HISTORY_LIMIT = 4;

/**
 * Кнопка «Скачать приложение» в топбаре (#263, рядом с лупой): браузеру —
 * прямая загрузка NSIS-установщика, оболочке — точка обновления (пассивный
 * поток: скачано и ждёт решения пользователя). Наведение — попап с версией,
 * примечанием релиза и историей. Нет манифеста `/desktop/` — кнопки нет.
 */
export function DownloadAppButton() {
  const { manifest, changelog, inShell, updateState } = useDesktopApp();
  const installerUrl = manifest ? windowsInstallerUrl(manifest) : null;
  const [open, setOpen] = useState(false);
  const enterTimer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(enterTimer.current);
      window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  if (!manifest || !installerUrl) return null;

  const updateReady = inShell && updateState.status === 'available';
  const downloading = inShell && updateState.status === 'downloading';
  const label = updateReady ? ui.topbar.updateApp : ui.topbar.downloadApp;
  const history = (changelog ?? []).filter((entry) => entry.version !== manifest.version);

  const scheduleOpen = () => {
    window.clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    window.clearTimeout(enterTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {inShell ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            className="relative text-muted-foreground hover:bg-accent hover:text-foreground"
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            onClick={updateReady ? () => void desktopApplyUpdate() : undefined}
          >
            <Download className="size-4" strokeWidth={1.75} />
            {updateReady && (
              <span className="absolute top-1 right-1 size-2 rounded-full bg-success" />
            )}
          </Button>
        ) : (
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            className="relative text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <a
              href={installerUrl}
              download
              onMouseEnter={scheduleOpen}
              onMouseLeave={scheduleClose}
            >
              <Download className="size-4" strokeWidth={1.75} />
            </a>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-3"
        onMouseEnter={() => window.clearTimeout(leaveTimer.current)}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {ui.topbar.downloadAppHint}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
              {manifest.version}
            </span>
            {manifest.pub_date && (
              <span className="text-xs text-muted-foreground">{formatDate(manifest.pub_date)}</span>
            )}
          </div>

          {inShell ? (
            updateReady ? (
              <Button size="sm" className="self-start" onClick={() => void desktopApplyUpdate()}>
                {ui.topbar.updateAppRestart}
              </Button>
            ) : downloading ? (
              <div className="text-sm text-muted-foreground">
                {ui.topbar.updateDownloading}
                {updateState.version ? ` ${updateState.version}…` : '…'}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{ui.topbar.updateLatestInstalled}</div>
            )
          ) : (
            <Button asChild size="sm" className="self-start">
              <a href={installerUrl} download>
                {ui.topbar.downloadAppForWindows}
              </a>
            </Button>
          )}

          {manifest.notes && <p className="text-sm text-muted-foreground">{manifest.notes}</p>}

          {history.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {ui.topbar.releaseHistory}
              </div>
              {history.slice(0, HISTORY_LIMIT).map((entry) => (
                <div key={entry.version} className="flex gap-2 text-xs">
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {entry.version}
                  </span>
                  <span className="text-muted-foreground">{entry.notes}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
