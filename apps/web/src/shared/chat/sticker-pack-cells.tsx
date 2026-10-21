import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { StickerPack } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { useCanManageStickerPacks, useRemoveSticker } from './sticker-api.js';
import { StickerGlyph } from './sticker-message.js';

/** Секция и ячейки пака вынесены из sticker-picker (#409, I5): пикер держит
 *  скролл/вкладки, ячейки — свою popover-логику удаления. */

/** Заголовок секции единого списка: название + «⋯» управления (без счётчика —
 *  ревизия 30.09: «некрасиво и ненужно»). */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground">
      {children}
    </h3>
  );
}

/** Ячейки пака: клик — отправка; ПКМ по управляемому паку — мини-меню
 *  «Убрать из пака» (компактный попап реакций — не узкий кастом). */
export function PackCells({
  pack,
  disabled,
  onPick,
}: {
  pack: StickerPack;
  disabled: boolean;
  onPick: (pack: StickerPack, stickerId: string) => void;
}) {
  const canManage = useCanManageStickerPacks();
  const manageable = pack.owned || (pack.scope === 'corporate' && canManage);
  const remove = useRemoveSticker();
  const [menuStickerId, setMenuStickerId] = useState<string | null>(null);

  return (
    <div className={cn('grid grid-cols-4 gap-1', disabled && 'pointer-events-none opacity-50')}>
      {pack.stickers.map((sticker) => {
        const menuOpen = menuStickerId === sticker.id;
        return (
          <Popover
            key={sticker.id}
            open={menuOpen}
            onOpenChange={(open) => setMenuStickerId(open ? sticker.id : null)}
          >
            <PopoverAnchor asChild>
              <button
                type="button"
                aria-label={`${pack.title}: ${sticker.emojis.join(' ')}`}
                title={
                  manageable
                    ? `${sticker.emojis.join(' ')} · ${ui.chat.stickerRemoveHint}`
                    : sticker.emojis.join(' ')
                }
                onClick={() => onPick(pack, sticker.id)}
                onContextMenu={
                  manageable
                    ? (event) => {
                        event.preventDefault();
                        setMenuStickerId((prev) => (prev === sticker.id ? null : sticker.id));
                      }
                    : undefined
                }
                className="flex cursor-pointer items-center justify-center rounded-lg p-1 transition-colors hover:bg-accent"
              >
                <StickerGlyph
                  url={sticker.url}
                  mime={sticker.mime}
                  alt={sticker.emojis.join(' ')}
                  className="size-14 object-contain"
                />
              </button>
            </PopoverAnchor>
            {manageable ? (
              <PopoverContent
                side="top"
                align="start"
                className="w-max min-w-44 p-1"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1 text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    remove.mutate(sticker.id);
                    setMenuStickerId(null);
                  }}
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                  {ui.chat.stickerRemoveFromPack}
                </button>
              </PopoverContent>
            ) : null}
          </Popover>
        );
      })}
    </div>
  );
}
