import { useState } from 'react';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { Spinner } from '@nodus/ui/components/spinner';

import {
  useInstallStickerPack,
  useSendSticker,
  useStickerPack,
  useUninstallStickerPack,
} from './sticker-api.js';
import { StickerCreateDialog } from './sticker-create-dialog.js';
import { StickerGlyph } from './sticker-message.js';
import { StickerPackMenu } from './sticker-pack-menu.js';

/**
 * Поповер пака по клику на стикер-сообщение (#143, модель Telegram/Битрикс24):
 * сетка пака (клик — отправить этот стикер), «Добавить пак»/«Убрать из моих»
 * (дистрибуция «из чата»), меню управления для владельца/админа. Пак может
 * быть не в «моих» — деталь грузится отдельным запросом; метаданные снапшота
 * на вложении дают название даже до ответа.
 */
export function StickerPackPopover({
  message,
  attachment,
  children,
}: {
  message: ChatMessage;
  attachment: MessageAttachment;
  children: React.ReactNode;
}) {
  const meta = attachment.sticker;
  const [open, setOpen] = useState(false);
  const [appendOpen, setAppendOpen] = useState(false);
  const detail = useStickerPack(open && meta ? meta.packId : '');
  const install = useInstallStickerPack();
  const uninstall = useUninstallStickerPack();
  const sendSticker = useSendSticker(message.conversationId);

  if (!meta) return <>{children}</>;
  const pack = detail.data;
  const canInstall = pack
    ? pack.scope === 'personal' && !pack.owned
    : meta.packScope === 'personal';
  const installed = pack?.installed ?? false;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {/* Панель не крадёт «вечный курсор» композера (канон #71). */}
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-72 p-2"
        >
          <div className="flex items-center gap-1 px-1 pb-1">
            <span className="truncate text-xs font-medium" title={meta.packTitle}>
              {pack?.title ?? meta.packTitle}
            </span>
            <span className="shrink-0 text-label-xs text-muted-foreground">
              {pack?.scope === 'corporate' || meta.packScope === 'corporate'
                ? ui.chat.stickerPackCorporate
                : ''}
            </span>
            <span className="ml-auto flex shrink-0 items-center">
              {pack ? <StickerPackMenu pack={pack} onAppend={() => setAppendOpen(true)} /> : null}
            </span>
          </div>
          {pack === undefined ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Spinner className="mr-2 size-4" />
              {ui.chat.stickerLoading}
            </div>
          ) : (
            <>
              <div className="grid max-h-64 grid-cols-4 gap-0.5 overflow-y-auto overscroll-contain p-1">
                {pack.stickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    type="button"
                    aria-label={`${pack.title}: ${sticker.emojis.join(' ')}`}
                    title={sticker.emojis.join(' ')}
                    onClick={() => {
                      sendSticker(pack, sticker, message.threadRootId);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center justify-center rounded-lg p-1 transition-transform hover:scale-110 hover:bg-accent"
                  >
                    <StickerGlyph
                      url={sticker.url}
                      mime={sticker.mime}
                      alt={sticker.emojis.join(' ')}
                      className="size-12 object-contain"
                    />
                  </button>
                ))}
              </div>
              {canInstall ? (
                installed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 w-full"
                    disabled={uninstall.isPending}
                    onClick={() => uninstall.mutate(pack.id)}
                  >
                    {ui.chat.stickerDeleteForMe}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-1 w-full"
                    disabled={install.isPending}
                    onClick={() => install.mutate(pack.id)}
                  >
                    {ui.chat.stickerInstall}
                  </Button>
                )
              ) : null}
            </>
          )}
        </PopoverContent>
      </Popover>
      {appendOpen && pack ? (
        <StickerCreateDialog open onOpenChange={setAppendOpen} appendTo={pack} />
      ) : null}
    </>
  );
}
