import { Check, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage, MessageAttachment, StickerPack } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { Spinner } from '@nodus/ui/components/spinner';

import {
  useCanManageStickerPacks,
  useInstallStickerPack,
  useRemoveSticker,
  useSendSticker,
  useStickerPack,
} from './sticker-api.js';
import { StickerGlyph } from './sticker-message.js';
import {
  DeletePackDialog,
  RenamePackDialog,
  StickerPackMenu,
  type PackDialogRequest,
} from './sticker-pack-menu.js';
import { StickerCreateDialog } from './sticker-create-dialog.js';

/**
 * Окно пака из чата (#143, ревизия по битрикс-референсу владельца 30.09):
 * ФИКСИРОВАННОЕ окно по центру (не «поповер разного размера в разном
 * месте»): заголовок с «⋯» (только при наличии команд) и крестиком, сетка
 * со скроллом, футер-полоса «Добавить себе» / «✓ Набор добавлен» /
 * «Корпоративный». Клик по стикеру в окне — мини-меню «Отправить в чат»
 * (+ «Удалить из набора» своим/корпоративным), НЕ мгновенная отправка —
 * так в Битрикс24. Пак удалён (деталь 404) — деградация: снапшот-заголовок,
 * пояснение, никаких мёртвых команд. Диалоги управления — поверх окна.
 */

/** Фиксированный габарит окна (один для любого пака — канон Битрикс24). */
const WINDOW_CLASS =
  'flex h-[440px] w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[420px]';

/** Кнопка-глиф стикера, открывающая окно пака: единая поверхность для
 *  ленты и постов тредов. ПКМ не перехватывает (MessageMenu снаружи). */
export function StickerWindowTrigger({
  message,
  attachment,
  children,
}: {
  message: ChatMessage;
  attachment: MessageAttachment;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const meta = attachment.sticker;
  if (!meta) return <>{children}</>;
  return (
    <>
      {/* Поверхность для ПКМ-меню сообщения и подсветки выделения
          (globals.css красит по data-selected). Ховера НЕТ (вердикт
          01.10 #175: плашка за стикером не нужна — только клик). */}
      <button
        type="button"
        data-slot="sticker-surface"
        aria-label={`${meta.packTitle}: ${meta.emojis.join(' ')}`}
        title={meta.packTitle}
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-2xl border border-transparent p-2"
      >
        {children}
      </button>
      <StickerPackWindow
        message={message}
        attachment={attachment}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function StickerPackWindow({
  message,
  attachment,
  open,
  onOpenChange,
}: {
  message: ChatMessage;
  attachment: MessageAttachment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = attachment.sticker;
  const detail = useStickerPack(open && meta ? meta.packId : '');
  const install = useInstallStickerPack();
  const removeSticker = useRemoveSticker();
  const sendSticker = useSendSticker(message.conversationId);
  const canManageCorporate = useCanManageStickerPacks();
  // Тяжёлые окна — поверх окна пака (сами Dialog, не внутри поповеров).
  const [packDialog, setPackDialog] = useState<PackDialogRequest | null>(null);

  if (!meta || !open) return null;
  const pack = detail.data;
  const gone = detail.isError;
  const corporate = (pack?.scope ?? meta.packScope) === 'corporate';
  // Отправка доступна лишь там, где сервер её примет (корпоративный | свой |
  // установленный); чужой неустановленный — сперва «Добавить себе».
  const sendable =
    pack !== undefined && (pack.scope === 'corporate' || pack.owned || pack.installed);
  // «Добавить себе» — только ЧУЖОЙ неустановленный личный пак; свой и уже
  // установленный показывают «Набор добавлен» (модель Битрикс24).
  const canInstall =
    pack !== undefined && pack.scope === 'personal' && !pack.owned && !pack.installed;
  const added = pack !== undefined && (pack.owned || pack.installed);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={WINDOW_CLASS} onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="flex shrink-0 items-center gap-2 pb-1 pl-4 pr-12 pt-3">
            <DialogTitle className="min-w-0 truncate text-base font-medium">
              {pack?.title ?? meta.packTitle}
            </DialogTitle>
            {/* Лейбл «Корпоративный» в шапке убран (вердикт 30.09: слово
                дублировалось с футером) — признак только в футере окна. */}
            <span className="ml-auto flex shrink-0 items-center">
              {pack ? <StickerPackMenu pack={pack} onDialog={setPackDialog} /> : null}
            </span>
          </div>
          {gone ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {ui.chat.stickerPackGone}
            </div>
          ) : detail.isLoading || !pack ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
              <Spinner className="mr-2 size-4" />
              {ui.chat.stickerLoading}
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                <div className="grid grid-cols-4 gap-1">
                  {pack.stickers.map((sticker) => (
                    <StickerCell
                      key={sticker.id}
                      packTitle={pack.title}
                      sticker={sticker}
                      sendable={sendable}
                      manageable={pack.owned || (pack.scope === 'corporate' && canManageCorporate)}
                      onSend={() => {
                        sendSticker(pack, sticker, message.threadRootId);
                        onOpenChange(false);
                      }}
                      onRemove={() => removeSticker.mutate(sticker.id)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex h-13 shrink-0 items-center justify-center bg-accent/40 px-3">
                {canInstall ? (
                  <Button
                    type="button"
                    size="lg"
                    className="ml-auto min-w-44"
                    disabled={install.isPending}
                    onClick={() => install.mutate(pack.id)}
                  >
                    {ui.chat.stickerAddToSelf}
                  </Button>
                ) : corporate ? (
                  <span className="text-sm text-muted-foreground">
                    {ui.chat.stickerCorporatePack}
                  </span>
                ) : added ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="size-4" strokeWidth={1.75} />
                    {ui.chat.stickerPackAdded}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {packDialog?.kind === 'append' && pack ? (
        <StickerCreateDialog
          open
          onOpenChange={() => setPackDialog(null)}
          appendTo={packDialog.pack}
        />
      ) : null}
      {packDialog?.kind === 'rename' ? (
        <RenamePackDialog pack={packDialog.pack} onClose={() => setPackDialog(null)} />
      ) : null}
      {packDialog?.kind === 'delete' ? (
        <DeletePackDialog pack={packDialog.pack} onClose={() => setPackDialog(null)} />
      ) : null}
    </>
  );
}

/** Ячейка сетки окна: клик — мини-меню (Битрикс24), не мгновенная отправка. */
function StickerCell({
  packTitle,
  sticker,
  sendable,
  manageable,
  onSend,
  onRemove,
}: {
  packTitle: string;
  sticker: StickerPack['stickers'][number];
  sendable: boolean;
  manageable: boolean;
  onSend: () => void;
  onRemove: () => void;
}) {
  const label = `${packTitle}: ${sticker.emojis.join(' ')}`;
  // Команд нет (чужой неустановленный пак) — голый глиф: пустое меню —
  // тот же мусор, что «...» без пунктов (ревизия 30.09).
  if (!sendable && !manageable) {
    return (
      <button
        type="button"
        aria-label={label}
        title={sticker.emojis.join(' ')}
        disabled
        className="flex cursor-default items-center justify-center rounded-lg p-1"
      >
        <StickerGlyph
          url={sticker.url}
          mime={sticker.mime}
          alt={sticker.emojis.join(' ')}
          className="size-16 object-contain"
        />
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={sticker.emojis.join(' ')}
          className="flex cursor-pointer items-center justify-center rounded-lg p-1 transition-colors hover:bg-accent"
        >
          <StickerGlyph
            url={sticker.url}
            mime={sticker.mime}
            alt={sticker.emojis.join(' ')}
            className="size-16 object-contain"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-max min-w-44">
        {sendable ? (
          <DropdownMenuItem onSelect={onSend}>
            <Send className="size-4" strokeWidth={1.75} />
            {ui.chat.stickerSendToChat}
          </DropdownMenuItem>
        ) : null}
        {manageable ? (
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2 className="size-4" strokeWidth={1.75} />
            {ui.chat.stickerRemoveFromSet}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
