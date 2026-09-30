import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import type { StickerSubmitPayload } from './sticker-api.js';
import { EmojiPanel } from './emoji-picker.js';
import { StickerPanel } from './sticker-picker.js';
import { DeletePackDialog, RenamePackDialog, type PackDialogRequest } from './sticker-pack-menu.js';
import { StickerCreateDialog } from './sticker-create-dialog.js';

/**
 * Медиа-пикер композера (#143): кнопка Smile открывает панель с вкладками
 * «Эмодзи | Стикеры» (макет владельца 28.09 — третья вкладка «Гифки»
 * зарезервирована на будущее). Габарит панели ОДИНАКОВ на обеих вкладках и
 * не меняется при переключении/фильтрации (канон оверлеев-пикеров);
 * панель живёт между выборами (канон Telegram). Попап не крадёт «вечный
 * курсор» (канон #71). Сегмент вкладок — с воздухом от границ панели.
 *
 * ТЯЖЁЛЫЕ ДИАЛОГИ (создание/переименование/удаление пака) рендерятся ЗДЕСЬ,
 * ВНЕ поповера: клик мимо закрывает поповер и уносит потомков вместе с
 * диалогом — preventDefault на диалоге не спасает от смерти родителя
 * (репро 30.09, вердикт владельца «всё равно закрывается»). Панель только
 * запрашивает окно колбэком onHostDialog.
 */

type MediaTab = 'emoji' | 'stickers';

export function MediaPickerButton({
  onPickEmoji,
  onPickSticker,
  stickersDisabled = false,
  children,
}: {
  onPickEmoji: (emoji: string) => void;
  onPickSticker: (payload: StickerSubmitPayload) => void;
  /** Селект/пересылка/нет права поста — вкладка стикеров заблокирована. */
  stickersDisabled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<MediaTab>('emoji');
  const [packDialog, setPackDialog] = useState<PackDialogRequest | null>(null);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-88 p-0"
          // «Вечный курсор» (канон #71): попап не крадёт фокус композера.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div
            role="tablist"
            aria-label={ui.chat.emoji}
            className="flex gap-1 border-b border-border px-2 pt-2 pb-1.5"
          >
            <TabButton id="emoji" active={tab === 'emoji'} onSelect={setTab}>
              {ui.chat.emojiTab}
            </TabButton>
            <TabButton id="stickers" active={tab === 'stickers'} onSelect={setTab}>
              {ui.chat.stickerTab}
            </TabButton>
          </div>
          {/* Контент-зона фиксированной высоты — габарит панели не прыгает
              между вкладками (канон пикеров). */}
          <div className="flex h-80 flex-col overflow-hidden">
            {tab === 'emoji' ? <EmojiPanel onPick={onPickEmoji} /> : null}
            {tab === 'stickers' ? (
              <StickerPanel
                onPick={onPickSticker}
                onHostDialog={setPackDialog}
                disabled={stickersDisabled}
              />
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {packDialog?.kind === 'create' ? (
        <StickerCreateDialog open onOpenChange={() => setPackDialog(null)} appendTo={null} />
      ) : null}
      {packDialog?.kind === 'append' ? (
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

function TabButton({
  id,
  active,
  onSelect,
  children,
}: {
  id: MediaTab;
  active: boolean;
  onSelect: (id: MediaTab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={cn(
        'h-7 flex-1 cursor-pointer rounded-lg px-2 text-xs transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
