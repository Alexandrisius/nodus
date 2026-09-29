import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { StickerPack } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Spinner } from '@nodus/ui/components/spinner';
import { cn } from '@nodus/ui/lib/utils';

import {
  useStickerPacks,
  type StickerSubmitPayload,
  buildStickerAttachment,
} from './sticker-api.js';
import { StickerCreateDialog } from './sticker-create-dialog.js';
import { StickerGlyph } from './sticker-message.js';
import { pushRecentSticker, recentStickers, type RecentSticker } from './sticker-recent.js';
import { StickerPackMenu } from './sticker-pack-menu.js';

/**
 * Вкладка «Стикеры» медиа-пикера композера (#143, модель Telegram/Битрикс24):
 * «Недавние» (12, localStorage) → корпоративные паки → личные/установленные;
 * клик по стикеру — мгновенная отправка (панель живёт, серия — канон
 * Telegram); «+» — создание пака; «⋯» в шапке секции — управление.
 * Зона списка фиксированной высоты (канон оверлеев-пикеров: габарит не
 * прыгает между вкладками).
 */

export function StickerPanel({
  onPick,
  disabled = false,
}: {
  onPick: (payload: StickerSubmitPayload) => void;
  /** Нет права поста/режим селекта/пересылки — отправка запрещена. */
  disabled?: boolean;
}) {
  const packsQuery = useStickerPacks();
  const [recent, setRecent] = useState<RecentSticker[]>(() => recentStickers());
  const [createOpen, setCreateOpen] = useState(false);
  const [appendTo, setAppendTo] = useState<StickerPack | null>(null);

  const packs = packsQuery.data?.items ?? [];
  const corporate = packs.filter((p) => p.scope === 'corporate');
  const personal = packs.filter((p) => p.scope !== 'corporate');
  // «Недавние» живы, пока их пак существует (soft-delete пака чистит список).
  const aliveIds = new Set(packs.flatMap((p) => p.stickers.map((s) => s.id)));
  const recentAlive = recent.filter((r) => aliveIds.has(r.id));

  function pickPackSticker(pack: StickerPack, stickerIndex: number) {
    if (disabled) return;
    const sticker = pack.stickers[stickerIndex];
    if (!sticker) return;
    pushRecentSticker(sticker, pack);
    setRecent(recentStickers());
    onPick({
      stickerId: sticker.id,
      attachment: buildStickerAttachment(sticker, sticker.emojis, pack),
    });
  }

  function pickRecentSticker(entry: RecentSticker) {
    if (disabled) return;
    onPick({
      stickerId: entry.id,
      attachment: buildStickerAttachment(entry, entry.emojis, {
        id: entry.packId,
        title: entry.packTitle,
        scope: entry.packScope,
      }),
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-border px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => {
            setAppendTo(null);
            setCreateOpen(true);
          }}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          {ui.chat.stickerCreatePack}
        </Button>
      </div>
      <div className="h-80 overflow-y-auto overscroll-contain p-2">
        {packsQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Spinner className="mr-2 size-4" />
            {ui.chat.stickerLoading}
          </div>
        ) : packs.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <span>{ui.chat.stickerEmpty}</span>
          </div>
        ) : (
          <>
            {recentAlive.length > 0 ? (
              <section className="mb-1">
                <h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  {ui.chat.stickerRecent}
                </h3>
                <StickerGrid disabled={disabled}>
                  {recentAlive.map((entry) => (
                    <button
                      key={`recent:${entry.id}`}
                      type="button"
                      aria-label={entry.packTitle}
                      title={entry.packTitle}
                      onClick={() => pickRecentSticker(entry)}
                      className={CELL}
                    >
                      <StickerGlyph
                        url={entry.url}
                        mime={entry.mime}
                        alt={entry.packTitle}
                        className="size-12 object-contain"
                      />
                    </button>
                  ))}
                </StickerGrid>
              </section>
            ) : null}
            {[...corporate, ...personal].map((pack) => (
              <section key={pack.id} className="mb-1">
                <h3 className="flex items-center gap-1 px-1 pb-1 text-xs font-medium text-muted-foreground">
                  <span className="truncate" title={pack.title}>
                    {pack.title}
                  </span>
                  <StickerPackMenu
                    pack={pack}
                    onAppend={(target) => {
                      setAppendTo(target);
                      setCreateOpen(true);
                    }}
                  />
                </h3>
                <StickerGrid disabled={disabled}>
                  {pack.stickers.map((sticker, index) => (
                    <button
                      key={sticker.id}
                      type="button"
                      aria-label={`${pack.title}: ${sticker.emojis.join(' ')}`}
                      title={sticker.emojis.join(' ')}
                      onClick={() => pickPackSticker(pack, index)}
                      className={CELL}
                    >
                      <StickerGlyph
                        url={sticker.url}
                        mime={sticker.mime}
                        alt={sticker.emojis.join(' ')}
                        className="size-12 object-contain"
                      />
                    </button>
                  ))}
                </StickerGrid>
              </section>
            ))}
          </>
        )}
      </div>
      {createOpen ? (
        <StickerCreateDialog open onOpenChange={setCreateOpen} appendTo={appendTo} />
      ) : null}
    </div>
  );
}

const CELL =
  'flex cursor-pointer items-center justify-center rounded-lg p-1 transition-transform hover:scale-110 hover:bg-accent';

function StickerGrid({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  return (
    <div
      role="grid"
      aria-disabled={disabled}
      className={cn('grid grid-cols-5 gap-0.5', disabled && 'pointer-events-none opacity-50')}
    >
      {children}
    </div>
  );
}
